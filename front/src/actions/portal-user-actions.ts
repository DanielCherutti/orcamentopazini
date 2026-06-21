"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { StringRecordId, Table } from "surrealdb";
import { revalidatePath } from "next/cache";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { hashPassword } from "@/lib/password";
import { assertPasswordPolicy } from "@/lib/password-pwned";
import { PASSWORD_MAX_LENGTH } from "@/lib/password-strength";
import {
    assertPortalAdminSession,
    assertTenantSession,
} from "@/lib/tenant-context";
import { tenantHasUserCapacity } from "@/lib/platform-user";
import { assertTenantOperationalForInvite } from "@/actions/platform-actions";
import {
    listTenantMembersAction,
    removeTenantMemberAction,
    updateTenantMemberRoleAction,
} from "@/actions/tenant-actions";
import { passwordHashLooksValid } from "@/lib/password-hash-present";
import { sendPortalInviteEmail } from "@/lib/portal-invite-mail";
import { resolveInviteAppBaseUrl } from "@/lib/proposal-mail-settings";
import { recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";
import type { OrganizationMemberRole, TenantRole } from "@/types/tenant-types";
import { tenantRecordId } from "@/lib/tenant-query";

const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

const createUserSchema = z.object({
    email: z.string().trim().email("E-mail inválido"),
    role: z.enum(["user", "admin"]).optional(),
});

export type PortalUserPublic = {
    id: string;
    email: string;
    created_at?: string;
    active?: boolean;
    pending_setup?: boolean;
    tenant_role?: TenantRole;
    membership_id?: string;
};

function isSafePortalUserRecordId(id: string): boolean {
    if (!id.startsWith("portal_user:")) return false;
    const rest = id.slice("portal_user:".length);
    return (
        rest.length > 0 &&
        rest.length <= 128 &&
        /^[A-Za-z0-9_-]+$/.test(rest)
    );
}

const resetPasswordSchema = z
    .object({
        userId: z.string().min(1),
        password: z
            .string()
            .min(1, "Informe a senha")
            .max(PASSWORD_MAX_LENGTH, "Senha muito longa"),
        passwordConfirm: z.string().min(1, "Confirme a senha"),
    })
    .refine((d) => d.password === d.passwordConfirm, {
        message: "As senhas não coincidem",
        path: ["passwordConfirm"],
    });

async function userHasTenantMembership(
    userId: string,
    tenantId: string,
): Promise<boolean> {
    const db = await getDb();
    const rows = await db.query<[unknown[]]>(
        "SELECT id FROM portal_user_tenant WHERE user_id = $userId AND tenant_id = $tenantId LIMIT 1",
        {
            userId: requireRecordId("portal_user", userId),
            tenantId: tenantRecordId(tenantId),
        },
    );
    return (rows[0]?.length ?? 0) > 0;
}

export async function listPortalUsersAction(): Promise<{
    success: boolean;
    users?: PortalUserPublic[];
    error?: string;
}> {
    const members = await listTenantMembersAction();
    if (!members.success || !members.data) {
        return { success: false, error: members.error ?? "Erro ao listar usuários" };
    }

    const users: PortalUserPublic[] = members.data.map((m) => ({
        id: m.userId,
        email: m.email,
        active: m.active,
        pending_setup: m.pending_setup,
        tenant_role: m.role,
        membership_id: m.membershipId,
    }));

    return { success: true, users: toPlain(users) };
}

export async function createPortalUserAction(
    _prev: unknown,
    formData: FormData,
): Promise<{
    success: boolean;
    error?: string;
    message?: string;
    fieldErrors?: Record<string, string[]>;
}> {
    const auth = await assertPortalAdminSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const roleRaw = formData.get("role")?.toString().trim() || "user";
    const inviteRole: OrganizationMemberRole = roleRaw === "admin" ? "admin" : "user";

    const parsed = createUserSchema.safeParse({
        email: formData.get("email"),
        role: inviteRole,
    });

    if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors as Record<
            string,
            string[] | undefined
        >;
        return { success: false, fieldErrors: fieldErrors as Record<string, string[]> };
    }

    const baseUrl = await resolveInviteAppBaseUrl();
    if (!baseUrl) {
        return {
            success: false,
            error:
                "Defina a URL pública do sistema em Configurações da empresa (E-mail / convites) ou APP_URL / NEXT_PUBLIC_APP_URL no .env.",
        };
    }

    const email = parsed.data.email.trim().toLowerCase();
    const tenantId = auth.ctx.tenantId;
    const invite_token = randomBytes(32).toString("hex");
    const invite_expires_at = new Date(Date.now() + INVITE_TTL_MS).toISOString();

    const db = await getDb();
    try {
        const licenseBlock = await assertTenantOperationalForInvite(tenantId);
        if (licenseBlock) {
            return { success: false, error: licenseBlock };
        }

        const capacity = await tenantHasUserCapacity(tenantId, db);
        if (!capacity.ok) {
            return { success: false, error: capacity.error };
        }

        const existing = await db.query<[Array<{ id: unknown }>]>(
            "SELECT id FROM portal_user WHERE email = $email LIMIT 1",
            { email },
        );
        const existingId = recordIdToString(existing[0]?.[0]?.id);

        if (existingId) {
            const inTenant = await userHasTenantMembership(existingId, tenantId);
            if (inTenant) {
                return {
                    success: false,
                    fieldErrors: { email: ["Este e-mail já pertence a esta organização"] },
                };
            }

            await db.create(new Table("portal_user_tenant")).content({
                user_id: new StringRecordId(existingId),
                tenant_id: tenantRecordId(tenantId),
                role: inviteRole,
                created_at: new Date().toISOString(),
            });

            revalidatePath("/settings/users");
            return {
                success: true,
                message: `${email} foi adicionado à organização atual com papel ${inviteRole}.`,
            };
        }

        const insertPayload = {
            email,
            active: true,
            invite_token,
            invite_expires_at,
            invite_tenant_id: tenantRecordId(tenantId),
            invite_tenant_role: inviteRole,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const insertResult = await db.insert(new Table("portal_user"), insertPayload);
        const createdRecord = Array.isArray(insertResult) ? insertResult[0] : insertResult;
        const newId = createdRecord?.id != null ? String(createdRecord.id) : null;
        if (!newId) {
            return { success: false, error: "Erro ao criar usuário" };
        }

        const inviteUrl = `${baseUrl}/convite?token=${encodeURIComponent(invite_token)}`;
        const mail = await sendPortalInviteEmail({ to: email, inviteUrl });

        if (!mail.ok) {
            try {
                await db.delete(new StringRecordId(newId));
            } catch (delErr) {
                console.error("createPortalUserAction rollback delete:", delErr);
            }
            return { success: false, error: mail.error };
        }

        revalidatePath("/settings/users");
        return {
            success: true,
            message: `Convite enviado para ${email}. A pessoa deve abrir o link no e-mail para criar a senha.`,
        };
    } catch (e) {
        console.error("createPortalUserAction:", e);
        if (isTokenExpiredError(e)) resetDb();
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("unique") || msg.includes("IDX")) {
            return {
                success: false,
                fieldErrors: { email: ["Este e-mail já está cadastrado"] },
            };
        }
        return { success: false, error: "Erro ao criar usuário" };
    }
}

export async function submitCreatePortalUser(formData: FormData) {
    return createPortalUserAction(null, formData);
}

export async function setPortalUserActiveAction(formData: FormData): Promise<{
    success: boolean;
    error?: string;
}> {
    const auth = await assertPortalAdminSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const userId = formData.get("userId")?.toString().trim() ?? "";
    const wantActive = formData.get("active")?.toString() === "true";

    if (!isSafePortalUserRecordId(userId)) {
        return { success: false, error: "Identificador de usuário inválido" };
    }

    if (!(await userHasTenantMembership(userId, auth.ctx.tenantId))) {
        return { success: false, error: "Usuário não encontrado nesta organização" };
    }

    const sessionEmail = auth.ctx.email;
    const db = await getDb();
    const rid = new StringRecordId(userId);
    try {
        const raw = await db.select<{ email: string; active?: boolean }>(rid);
        const row = (Array.isArray(raw) ? raw[0] : raw) as
            | { email: string; active?: boolean }
            | undefined;
        if (!row?.email) {
            return { success: false, error: "Usuário não encontrado" };
        }

        const targetEmail = row.email.trim().toLowerCase();

        if (!wantActive && targetEmail === sessionEmail.trim().toLowerCase()) {
            return {
                success: false,
                error: "Você não pode inativar a sua própria conta.",
            };
        }

        if (!wantActive) {
            const members = await listTenantMembersAction(auth.ctx.tenantId);
            const activeInTenant = (members.data ?? []).filter(
                (m) => m.userId !== userId && m.active !== false,
            );
            if (activeInTenant.length === 0) {
                return {
                    success: false,
                    error: "Deve existir pelo menos um usuário ativo nesta organização.",
                };
            }
        }

        await db.update(rid).merge({
            active: wantActive,
            updated_at: new Date().toISOString(),
        });

        revalidatePath("/settings/users");
        return { success: true };
    } catch (e) {
        console.error("setPortalUserActiveAction:", e);
        if (isTokenExpiredError(e)) resetDb();
        return { success: false, error: "Erro ao atualizar status do usuário" };
    }
}

export async function resetPortalUserPasswordAction(formData: FormData): Promise<{
    success: boolean;
    error?: string;
    fieldErrors?: Record<string, string[]>;
}> {
    const auth = await assertPortalAdminSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const parsed = resetPasswordSchema.safeParse({
        userId: formData.get("userId"),
        password: formData.get("password"),
        passwordConfirm: formData.get("passwordConfirm"),
    });

    if (!parsed.success) {
        const fe = parsed.error.flatten().fieldErrors as Record<
            string,
            string[] | undefined
        >;
        return {
            success: false,
            fieldErrors: fe as Record<string, string[]>,
        };
    }

    const { userId, password } = parsed.data;
    if (!isSafePortalUserRecordId(userId)) {
        return { success: false, error: "Identificador de usuário inválido" };
    }

    if (!(await userHasTenantMembership(userId, auth.ctx.tenantId))) {
        return { success: false, error: "Usuário não encontrado nesta organização" };
    }

    const policy = await assertPasswordPolicy(password);
    if (!policy.ok) {
        return {
            success: false,
            fieldErrors: { password: policy.errors },
        };
    }

    const db = await getDb();
    const rid = new StringRecordId(userId);
    try {
        const password_hash = await hashPassword(password);
        await db.query(
            "UPDATE $rid SET password_hash = $ph, updated_at = $u, invite_token = NONE, invite_expires_at = NONE",
            {
                rid,
                ph: password_hash,
                u: new Date().toISOString(),
            },
        );

        revalidatePath("/settings/users");
        return { success: true };
    } catch (e) {
        console.error("resetPortalUserPasswordAction:", e);
        if (isTokenExpiredError(e)) resetDb();
        return { success: false, error: "Erro ao alterar senha" };
    }
}

export async function deletePortalUserAction(formData: FormData): Promise<{
    success: boolean;
    error?: string;
}> {
    const auth = await assertPortalAdminSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const userId = formData.get("userId")?.toString().trim() ?? "";
    if (!isSafePortalUserRecordId(userId)) {
        return { success: false, error: "Identificador de usuário inválido" };
    }

    return removeTenantMemberAction({ userId, tenantId: auth.ctx.tenantId });
}

export async function updatePortalUserTenantRoleAction(formData: FormData): Promise<{
    success: boolean;
    error?: string;
}> {
    const auth = await assertPortalAdminSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const userId = formData.get("userId")?.toString().trim() ?? "";
    const roleRaw = formData.get("role")?.toString().trim() ?? "user";
    const role: OrganizationMemberRole = roleRaw === "admin" ? "admin" : "user";

    if (!isSafePortalUserRecordId(userId)) {
        return { success: false, error: "Identificador de usuário inválido" };
    }

    return updateTenantMemberRoleAction({
        userId,
        tenantId: auth.ctx.tenantId,
        role,
    });
}

export async function getPortalAdminCapabilitiesAction(): Promise<{
    success: boolean;
    data?: { tenantName: string | null };
    error?: string;
}> {
    const auth = await assertTenantSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    let tenantName: string | null = null;
    try {
        const rows = await db.query<[Array<{ name?: string }>]>(
            "SELECT name FROM tenant WHERE id = $id LIMIT 1",
            { id: tenantRecordId(auth.ctx.tenantId) },
        );
        tenantName = rows[0]?.[0]?.name ? String(rows[0][0].name) : null;
    } catch {
        tenantName = null;
    }

    return {
        success: true,
        data: {
            tenantName,
        },
    };
}

"use server";

import { z } from "zod";
import { StringRecordId } from "surrealdb";
import { revalidatePath } from "next/cache";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { hashPassword } from "@/lib/password";
import { assertPasswordPolicy } from "@/lib/password-pwned";
import { PASSWORD_MAX_LENGTH } from "@/lib/password-strength";
import {
    assertPortalAdminSession,
    assertTenantSession,
} from "@/lib/tenant-context";
import {
    createUserInTenant,
    userHasTenantMembership,
} from "@/lib/portal-user-invite";
import {
    listTenantMembersAction,
    removeTenantMemberAction,
    updateTenantMemberRoleAction,
} from "@/actions/tenant-actions";
import type { OrganizationMemberRole, TenantRole } from "@/types/tenant-types";
import { tenantRecordId } from "@/lib/tenant-query";
import { auditTenantAction } from "@/lib/audit-log";

const createUserSchema = z.object({
    email: z.string().trim().email("E-mail inválido"),
    role: z.enum(["user", "admin"]).optional(),
    password: z
        .string()
        .max(PASSWORD_MAX_LENGTH, "Senha muito longa")
        .optional(),
    passwordConfirm: z.string().optional(),
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
        password: formData.get("password"),
        passwordConfirm: formData.get("passwordConfirm"),
    });

    if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors as Record<
            string,
            string[] | undefined
        >;
        return { success: false, fieldErrors: fieldErrors as Record<string, string[]> };
    }

    const result = await createUserInTenant({
        tenantId: auth.ctx.tenantId,
        email: parsed.data.email,
        role: inviteRole,
        password: parsed.data.password?.trim() ?? "",
        passwordConfirm: parsed.data.passwordConfirm?.trim() ?? "",
        revalidatePaths: ["/settings/users"],
    });
    if (result.success) {
        await auditTenantAction({
            action: "portal_user.create",
            resourceType: "portal_user",
            resourceId: result.userId,
            tenantId: auth.ctx.tenantId,
            summary: `Usuário ${parsed.data.email} criado`,
            metadata: { role: inviteRole },
        });
    }
    return result;
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
        await auditTenantAction({
            action: wantActive ? "portal_user.activate" : "portal_user.deactivate",
            resourceType: "portal_user",
            resourceId: userId,
            tenantId: auth.ctx.tenantId,
            summary: `Usuário ${targetEmail} ${wantActive ? "ativado" : "desativado"}`,
        });
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
        await auditTenantAction({
            action: "portal_user.password_reset",
            resourceType: "portal_user",
            resourceId: userId,
            tenantId: auth.ctx.tenantId,
            summary: "Senha redefinida para usuário do portal",
        });
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

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { StringRecordId, Table } from "surrealdb";

import {
    assertPlatformSession,
    getSessionContext,
} from "@/lib/tenant-context";
import { hashPassword } from "@/lib/password";
import { assertPasswordPolicy } from "@/lib/password-pwned";
import { PASSWORD_MAX_LENGTH } from "@/lib/password-strength";
import { passwordHashLooksValid } from "@/lib/password-hash-present";
import {
    assertEmailAvailableForPlatformInvite,
    countPlatformUsersByRole,
    emailHasOrgMembership,
    getPlatformRoleForEmail,
} from "@/lib/platform-user";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { InvalidRecordIdError, recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";
import {
    INVITABLE_PLATFORM_ROLES,
    PLATFORM_ROLE_LABELS,
    isPlatformRole,
    type PlatformRole,
} from "@/types/platform-types";

const createMemberSchema = z.object({
    email: z.string().trim().email("E-mail inválido"),
    role: z.enum(["commercial", "support", "readonly"]),
});

const setPasswordSchema = z
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

export type PlatformTeamMember = {
    userId: string;
    email: string;
    active: boolean;
    platform_role: PlatformRole;
    pending_setup: boolean;
};

export async function listPlatformTeamAction(): Promise<{
    success: boolean;
    data?: PlatformTeamMember[];
    error?: string;
}> {
    const auth = await assertPlatformSession("team.manage");
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const rows = await db.query<
            [Array<{ id: unknown; email?: string; active?: boolean; platform_role?: unknown; password_hash?: string }>]
        >(
            `SELECT id, email, active, platform_role, password_hash FROM portal_user
             WHERE platform_role IS NOT NONE
             ORDER BY email ASC`,
        );

        const data: PlatformTeamMember[] = [];
        for (const row of rows[0] ?? []) {
            const role = isPlatformRole(row.platform_role) ? row.platform_role : null;
            const userId = recordIdToString(row.id);
            if (!userId || !row.email || !role) continue;
            data.push({
                userId,
                email: String(row.email).trim().toLowerCase(),
                active: row.active !== false,
                platform_role: role,
                pending_setup: !passwordHashLooksValid(row.password_hash),
            });
        }

        return { success: true, data: toPlain(data) };
    } catch (error) {
        console.error("listPlatformTeamAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao listar equipe" };
    }
}

/** Cria usuário da plataforma (e-mail + papel). Sem envio de e-mail. */
export async function createPlatformTeamMemberAction(input: {
    email: string;
    role: PlatformRole;
}): Promise<{ success: boolean; error?: string; message?: string; data?: PlatformTeamMember }> {
    const auth = await assertPlatformSession("team.manage");
    if (!auth.ok) return { success: false, error: auth.error };

    if (!INVITABLE_PLATFORM_ROLES.includes(input.role)) {
        return { success: false, error: "Papel inválido" };
    }

    const parsed = createMemberSchema.safeParse({ email: input.email, role: input.role });
    if (!parsed.success) {
        return { success: false, error: parsed.error.flatten().fieldErrors.email?.[0] ?? "Dados inválidos" };
    }

    const email = parsed.data.email.trim().toLowerCase();
    const role = parsed.data.role;

    const db = await getDb();
    try {
        const exclusive = await assertEmailAvailableForPlatformInvite(email, db);
        if (!exclusive.ok) return { success: false, error: exclusive.error };

        const existing = await db.query<
            [Array<{ id: unknown; password_hash?: string; platform_role?: unknown }>]
        >("SELECT id, password_hash, platform_role FROM portal_user WHERE email = $email LIMIT 1", {
            email,
        });
        const existingRow = existing[0]?.[0];
        const existingId = recordIdToString(existingRow?.id);
        const now = new Date().toISOString();

        if (existingId) {
            if (isPlatformRole(existingRow?.platform_role)) {
                return { success: false, error: "Este e-mail já faz parte da equipe da plataforma." };
            }

            const userRid = new StringRecordId(existingId);
            await db.query(
                `UPDATE $rid SET
                    platform_role = $role,
                    is_platform_master = false,
                    active = true,
                    invite_kind = NONE,
                    invite_platform_role = NONE,
                    invite_token = NONE,
                    invite_expires_at = NONE,
                    invite_tenant_id = NONE,
                    invite_tenant_role = NONE,
                    updated_at = $u`,
                { rid: userRid, role, u: now },
            );

            const pending_setup = !passwordHashLooksValid(existingRow?.password_hash);
            revalidatePath("/platform/team");
            return {
                success: true,
                message: pending_setup
                    ? `Usuário ${email} criado. Defina a senha para liberar o login.`
                    : `Usuário ${email} adicionado à equipe (${PLATFORM_ROLE_LABELS[role]}).`,
                data: {
                    userId: existingId,
                    email,
                    active: true,
                    platform_role: role,
                    pending_setup,
                },
            };
        }

        const insertResult = await db.insert(new Table("portal_user"), {
            email,
            active: true,
            platform_role: role,
            is_platform_master: false,
            created_at: now,
            updated_at: now,
        });
        const created = Array.isArray(insertResult) ? insertResult[0] : insertResult;
        const userId = created?.id != null ? recordIdToString(created.id) : null;
        if (!userId) return { success: false, error: "Erro ao criar usuário" };

        revalidatePath("/platform/team");
        return {
            success: true,
            message: `Usuário ${email} criado. Defina a senha para liberar o login.`,
            data: {
                userId,
                email,
                active: true,
                platform_role: role,
                pending_setup: true,
            },
        };
    } catch (error) {
        console.error("createPlatformTeamMemberAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        const msg = error instanceof Error ? error.message : "";
        if (msg.includes("unique") || msg.includes("IDX")) {
            return { success: false, error: "Este e-mail já está cadastrado" };
        }
        return { success: false, error: "Erro ao criar usuário" };
    }
}

export async function setPlatformTeamMemberPasswordAction(input: {
    userId: string;
    password: string;
    passwordConfirm: string;
}): Promise<{ success: boolean; error?: string; fieldErrors?: Record<string, string[]> }> {
    const auth = await assertPlatformSession("team.manage");
    if (!auth.ok) return { success: false, error: auth.error };

    const parsed = setPasswordSchema.safeParse(input);
    if (!parsed.success) {
        const fe = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
        return { success: false, fieldErrors: fe as Record<string, string[]> };
    }

    const policy = await assertPasswordPolicy(parsed.data.password);
    if (!policy.ok) {
        return { success: false, fieldErrors: { password: policy.errors } };
    }

    const db = await getDb();
    try {
        const userRid = requireRecordId("portal_user", parsed.data.userId.trim());
        const raw = await db.select<{ platform_role?: unknown }>(userRid);
        const row = Array.isArray(raw) ? raw[0] : raw;
        if (!row || !isPlatformRole(row.platform_role)) {
            return { success: false, error: "Membro da equipe não encontrado" };
        }

        const password_hash = await hashPassword(parsed.data.password);
        await db.query(
            `UPDATE $rid SET
                password_hash = $ph,
                updated_at = $u,
                invite_kind = NONE,
                invite_platform_role = NONE,
                invite_token = NONE,
                invite_expires_at = NONE`,
            { rid: userRid, ph: password_hash, u: new Date().toISOString() },
        );

        revalidatePath("/platform/team");
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("setPlatformTeamMemberPasswordAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao definir senha" };
    }
}

/** @deprecated Use createPlatformTeamMemberAction */
export async function invitePlatformTeamMemberAction(input: {
    email: string;
    role: PlatformRole;
}): Promise<{ success: boolean; error?: string; message?: string }> {
    const res = await createPlatformTeamMemberAction(input);
    return { success: res.success, error: res.error, message: res.message };
}

export async function updatePlatformTeamMemberRoleAction(input: {
    userId: string;
    role: PlatformRole;
}): Promise<{ success: boolean; error?: string }> {
    const auth = await assertPlatformSession("team.manage");
    if (!auth.ok) return { success: false, error: auth.error };

    if (!isPlatformRole(input.role)) {
        return { success: false, error: "Papel inválido" };
    }

    const db = await getDb();
    const ctx = await getSessionContext();

    try {
        const userRid = requireRecordId("portal_user", input.userId.trim());
        const raw = await db.select<{ email?: string; platform_role?: unknown }>(userRid);
        const row = Array.isArray(raw) ? raw[0] : raw;
        const currentRole = isPlatformRole(row?.platform_role) ? row.platform_role : null;
        if (!row || !currentRole) {
            return { success: false, error: "Membro da equipe não encontrado" };
        }

        const email = String(row.email ?? "").trim().toLowerCase();
        if (ctx?.email.toLowerCase() === email && input.role !== "super_admin" && currentRole === "super_admin") {
            const superCount = await countPlatformUsersByRole("super_admin", db);
            if (superCount <= 1) {
                return { success: false, error: "Não é possível rebaixar o último Super Admin" };
            }
        }

        if (currentRole === "super_admin" && input.role !== "super_admin") {
            const superCount = await countPlatformUsersByRole("super_admin", db);
            if (superCount <= 1) {
                return { success: false, error: "Deve haver ao menos um Super Admin" };
            }
        }

        await db.update(userRid).merge({
            platform_role: input.role,
            is_platform_master: input.role === "super_admin",
            updated_at: new Date().toISOString(),
        });

        revalidatePath("/platform/team");
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("updatePlatformTeamMemberRoleAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao alterar papel" };
    }
}

export async function revokePlatformTeamMemberAction(userId: string): Promise<{
    success: boolean;
    error?: string;
}> {
    const auth = await assertPlatformSession("team.manage");
    if (!auth.ok) return { success: false, error: auth.error };

    const ctx = await getSessionContext();
    const db = await getDb();

    try {
        const userRid = requireRecordId("portal_user", userId.trim());
        const raw = await db.select<{ email?: string; platform_role?: unknown }>(userRid);
        const row = Array.isArray(raw) ? raw[0] : raw;
        const currentRole = isPlatformRole(row?.platform_role) ? row.platform_role : null;
        if (!row || !currentRole) {
            return { success: false, error: "Membro da equipe não encontrado" };
        }

        if (currentRole === "super_admin") {
            const superCount = await countPlatformUsersByRole("super_admin", db);
            if (superCount <= 1) {
                return { success: false, error: "Não é possível revogar o último Super Admin" };
            }
        }

        const email = String(row.email ?? "").trim().toLowerCase();
        if (ctx?.email.toLowerCase() === email) {
            return { success: false, error: "Revogue outro membro ou peça a outro Super Admin" };
        }

        await db.query(
            `UPDATE $rid SET
                platform_role = NONE,
                is_platform_master = false,
                active = false,
                invite_kind = NONE,
                invite_platform_role = NONE,
                invite_token = NONE,
                invite_expires_at = NONE,
                updated_at = $u`,
            { rid: userRid, u: new Date().toISOString() },
        );

        revalidatePath("/platform/team");
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("revokePlatformTeamMemberAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao revogar acesso" };
    }
}

export async function ensurePlatformRoleField(): Promise<void> {
    const db = await getDb();
    await db.query(`
        UPDATE portal_user SET platform_role = 'super_admin'
            WHERE is_platform_master = true AND (platform_role IS NONE OR platform_role IS NULL);
        UPDATE portal_user SET is_platform_master = false
            WHERE (platform_role IS NONE OR platform_role IS NULL) AND is_platform_master = true;
        UPDATE portal_user SET is_platform_master = true
            WHERE platform_role = 'super_admin';
    `);
}

/** Impede login operacional para contas da plataforma. */
export async function assertNotPlatformUserEmail(
    email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const role = await getPlatformRoleForEmail(email);
    if (role) {
        return {
            ok: false,
            error: "Esta conta é da equipe da plataforma. Acesse /platform.",
        };
    }
    return { ok: true };
}

export { emailHasOrgMembership, assertEmailAvailableForPlatformInvite };

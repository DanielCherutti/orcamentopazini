"use server";

import { z } from "zod";
import { StringRecordId, Table } from "surrealdb";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { hashPassword } from "@/lib/password";
import { assertPasswordPolicy } from "@/lib/password-pwned";
import { PASSWORD_MAX_LENGTH } from "@/lib/password-strength";
import { passwordHashLooksValid } from "@/lib/password-hash-present";
import { recordIdToString } from "@/lib/surreal-record-ids";
import { tenantRecordId } from "@/lib/tenant-query";
import { tenantHasUserCapacity } from "@/lib/platform-user";
import { isPlatformRole } from "@/types/platform-types";
import type { OrganizationMemberRole } from "@/types/tenant-types";

const completeInviteSchema = z
    .object({
        token: z.string().min(32, "Link inválido"),
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

export async function completePortalInviteAction(formData: FormData): Promise<{
    success: boolean;
    error?: string;
    fieldErrors?: Record<string, string[]>;
    redirect?: "platform" | "login";
}> {
    const parsed = completeInviteSchema.safeParse({
        token: formData.get("token"),
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

    const { token, password } = parsed.data;

    const policy = await assertPasswordPolicy(password);
    if (!policy.ok) {
        return {
            success: false,
            fieldErrors: { password: policy.errors },
        };
    }

    const db = await getDb();
    try {
        const rows = await db.query<
            [
                {
                    id: unknown;
                    invite_token?: string;
                    invite_expires_at?: string;
                    password_hash?: string;
                    active?: boolean;
                    invite_kind?: string;
                    invite_tenant_id?: unknown;
                    invite_tenant_role?: string;
                    invite_platform_role?: unknown;
                }[],
            ]
        >(
            `SELECT id, invite_token, invite_expires_at, password_hash, active,
                    invite_kind, invite_tenant_id, invite_tenant_role, invite_platform_role
             FROM portal_user WHERE invite_token = $invite_link_token LIMIT 1`,
            { invite_link_token: token },
        );
        const row = rows[0]?.[0];
        if (!row?.id) {
            return {
                success: false,
                error:
                    "Link inválido ou já utilizado. Peça um novo convite ao administrador.",
            };
        }

        if (passwordHashLooksValid(row.password_hash)) {
            return {
                success: false,
                error: "Este convite já foi utilizado. Faça login com seu e-mail e senha.",
            };
        }

        if (row.active === false) {
            return {
                success: false,
                error: "Esta conta está inativa. Peça ao administrador para reativar o acesso.",
            };
        }

        const exp = row.invite_expires_at
            ? Date.parse(row.invite_expires_at)
            : NaN;
        if (!Number.isFinite(exp) || Date.now() > exp) {
            return {
                success: false,
                error: "Este link expirou. Peça um novo convite ao administrador.",
            };
        }

        const password_hash = await hashPassword(password);
        const idStr = recordIdToString(row.id);
        if (!idStr.startsWith("portal_user:")) {
            console.error("completePortalInviteAction: id inesperado", row.id);
            return {
                success: false,
                error: "Não foi possível concluir o cadastro.",
            };
        }
        const rid = new StringRecordId(idStr);

        const isPlatformInvite =
            row.invite_kind === "platform" ||
            (isPlatformRole(row.invite_platform_role) && !row.invite_tenant_id);

        if (isPlatformInvite) {
            const platformRole = isPlatformRole(row.invite_platform_role)
                ? row.invite_platform_role
                : null;
            if (!platformRole) {
                return { success: false, error: "Convite da plataforma inválido." };
            }

            await db.query(
                `UPDATE $rid SET
                    password_hash = $ph,
                    platform_role = $role,
                    is_platform_master = $isMaster,
                    updated_at = $u,
                    invite_kind = NONE,
                    invite_platform_role = NONE,
                    invite_token = NONE,
                    invite_expires_at = NONE,
                    invite_tenant_id = NONE,
                    invite_tenant_role = NONE`,
                {
                    rid,
                    ph: password_hash,
                    role: platformRole,
                    isMaster: platformRole === "super_admin",
                    u: new Date().toISOString(),
                },
            );

            return { success: true, redirect: "platform" };
        }

        await db.query(
            `UPDATE $rid SET
                password_hash = $ph,
                updated_at = $u,
                invite_kind = NONE,
                invite_platform_role = NONE,
                invite_token = NONE,
                invite_expires_at = NONE,
                invite_tenant_id = NONE,
                invite_tenant_role = NONE`,
            {
                rid,
                ph: password_hash,
                u: new Date().toISOString(),
            },
        );

        const inviteTenantId = recordIdToString(row.invite_tenant_id);
        if (inviteTenantId) {
            const roleRaw = String(row.invite_tenant_role ?? "user");
            const role: OrganizationMemberRole =
                roleRaw === "admin" ? "admin" : "user";
            const existingLink = await db.query<[unknown[]]>(
                "SELECT id FROM portal_user_tenant WHERE user_id = $userId AND tenant_id = $tenantId LIMIT 1",
                {
                    userId: rid,
                    tenantId: tenantRecordId(inviteTenantId),
                },
            );
            if ((existingLink[0]?.length ?? 0) === 0) {
                const capacity = await tenantHasUserCapacity(inviteTenantId, db);
                if (!capacity.ok) {
                    return { success: false, error: capacity.error };
                }
                await db.create(new Table("portal_user_tenant")).content({
                    user_id: rid,
                    tenant_id: tenantRecordId(inviteTenantId),
                    role,
                    created_at: new Date().toISOString(),
                });
            }
        }

        return { success: true, redirect: "login" };
    } catch (e) {
        console.error("completePortalInviteAction:", e);
        if (isTokenExpiredError(e)) resetDb();
        const hint =
            process.env.NODE_ENV === "development" && e instanceof Error
                ? ` (${e.message})`
                : "";
        return {
            success: false,
            error: `Não foi possível concluir o cadastro.${hint}`,
        };
    }
}

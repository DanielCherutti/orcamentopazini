"use server";

import { z } from "zod";
import { Table, StringRecordId } from "surrealdb";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { hashPassword } from "@/lib/password";
import { assertPasswordPolicy } from "@/lib/password-pwned";
import { PASSWORD_MAX_LENGTH } from "@/lib/password-strength";
import { passwordHashLooksValid } from "@/lib/password-hash-present";
import { recordIdToString } from "@/lib/surreal-record-ids";
import { tenantRecordId } from "@/lib/tenant-query";
import { tenantHasUserCapacity } from "@/lib/platform-user";
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
                    invite_tenant_id?: unknown;
                    invite_tenant_role?: string;
                }[],
            ]
        >(
            "SELECT id, invite_token, invite_expires_at, password_hash, active, invite_tenant_id, invite_tenant_role FROM portal_user WHERE invite_token = $invite_link_token LIMIT 1",
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

        // SurrealDB 3: NONE em MERGE pode falhar; o projeto usa SET … = NONE em outros fluxos.
        await db.query(
            "UPDATE $rid SET password_hash = $ph, updated_at = $u, invite_token = NONE, invite_expires_at = NONE, invite_tenant_id = NONE, invite_tenant_role = NONE",
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

        return { success: true };
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

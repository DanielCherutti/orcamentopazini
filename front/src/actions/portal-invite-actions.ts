"use server";

import { z } from "zod";
import { StringRecordId } from "surrealdb";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { hashPassword } from "@/lib/password";
import { assertPasswordPolicy } from "@/lib/password-pwned";
import { PASSWORD_MAX_LENGTH } from "@/lib/password-strength";
import { passwordHashLooksValid } from "@/lib/password-hash-present";
import { recordIdToString } from "@/lib/surreal-record-ids";

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
                }[],
            ]
        >(
            "SELECT id, invite_token, invite_expires_at, password_hash, active FROM portal_user WHERE invite_token = $invite_link_token LIMIT 1",
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
            "UPDATE $rid SET password_hash = $ph, updated_at = $u, invite_token = NONE, invite_expires_at = NONE",
            {
                rid,
                ph: password_hash,
                u: new Date().toISOString(),
            },
        );

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

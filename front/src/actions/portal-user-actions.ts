"use server";

import { z } from "zod";
import { StringRecordId, Table } from "surrealdb";
import { revalidatePath } from "next/cache";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { hashPassword } from "@/lib/password";
import { getSession, getSessionEmail } from "@/actions/auth-actions";

const createUserSchema = z.object({
    email: z.string().trim().email("E-mail inválido"),
    password: z
        .string()
        .min(8, "Senha deve ter no mínimo 8 caracteres")
        .max(128, "Senha muito longa"),
});

export type PortalUserPublic = {
    id: string;
    email: string;
    created_at?: string;
    active?: boolean;
};

async function requireLoggedIn(): Promise<boolean> {
    return getSession();
}

/** Evita injection em UPDATE por id vindo do cliente. */
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
            .min(8, "Senha deve ter no mínimo 8 caracteres")
            .max(128, "Senha muito longa"),
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
    if (!(await requireLoggedIn())) {
        return { success: false, error: "Não autorizado" };
    }

    const db = await getDb();
    try {
        const result = await db.query<
            [PortalUserPublic[]]
        >(`SELECT id, email, created_at, active FROM portal_user ORDER BY email`);
        const rows = result[0] ?? [];
        const users = toPlain(rows).map((u) => ({
            ...u,
            id: String(u.id),
        }));
        return { success: true, users };
    } catch (e) {
        console.error("listPortalUsersAction:", e);
        if (isTokenExpiredError(e)) resetDb();
        return { success: false, error: "Erro ao listar usuários" };
    }
}

export async function createPortalUserAction(
    _prev: unknown,
    formData: FormData,
): Promise<{
    success: boolean;
    error?: string;
    fieldErrors?: Record<string, string[]>;
}> {
    if (!(await requireLoggedIn())) {
        return { success: false, error: "Não autorizado" };
    }

    const parsed = createUserSchema.safeParse({
        email: formData.get("email"),
        password: formData.get("password"),
    });

    if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors as Record<
            string,
            string[] | undefined
        >;
        return { success: false, fieldErrors: fieldErrors as Record<string, string[]> };
    }

    const email = parsed.data.email.trim().toLowerCase();
    const password_hash = await hashPassword(parsed.data.password);

    const db = await getDb();
    try {
        const existing = await db.query<[unknown[]]>(
            "SELECT id FROM portal_user WHERE email = $email LIMIT 1",
            { email },
        );
        if ((existing[0]?.length ?? 0) > 0) {
            return {
                success: false,
                fieldErrors: { email: ["Este e-mail já está cadastrado"] },
            };
        }

        await db.insert(new Table("portal_user"), {
            email,
            password_hash,
            active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });

        revalidatePath("/settings/users");
        return { success: true };
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

/** Para formulários/modais que chamam a action sem `useActionState`. */
export async function submitCreatePortalUser(formData: FormData) {
    return createPortalUserAction(null, formData);
}

export async function setPortalUserActiveAction(formData: FormData): Promise<{
    success: boolean;
    error?: string;
}> {
    if (!(await requireLoggedIn())) {
        return { success: false, error: "Não autorizado" };
    }

    const userId = formData.get("userId")?.toString().trim() ?? "";
    const wantActive = formData.get("active")?.toString() === "true";

    if (!isSafePortalUserRecordId(userId)) {
        return { success: false, error: "Identificador de usuário inválido" };
    }

    const sessionEmail = await getSessionEmail();
    if (!sessionEmail) {
        return { success: false, error: "Sessão inválida" };
    }

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
            const allRaw = await db.select(new Table("portal_user"));
            const list = toPlain(
                (Array.isArray(allRaw) ? allRaw : []) as Array<{
                    id: unknown;
                    email: string;
                    active?: boolean;
                }>,
            );
            const wouldRemainActive = list.filter((u) => {
                const id = String(u.id);
                if (id === userId) return false;
                return u.active !== false;
            });
            if (wouldRemainActive.length === 0) {
                return {
                    success: false,
                    error: "Deve existir pelo menos um usuário ativo.",
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
    if (!(await requireLoggedIn())) {
        return { success: false, error: "Não autorizado" };
    }

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

    const db = await getDb();
    const rid = new StringRecordId(userId);
    try {
        const raw = await db.select<{ email: string }>(rid);
        const row = (Array.isArray(raw) ? raw[0] : raw) as
            | { email: string }
            | undefined;
        if (!row?.email) {
            return { success: false, error: "Usuário não encontrado" };
        }

        const password_hash = await hashPassword(password);
        await db.update(rid).merge({
            password_hash,
            updated_at: new Date().toISOString(),
        });

        revalidatePath("/settings/users");
        return { success: true };
    } catch (e) {
        console.error("resetPortalUserPasswordAction:", e);
        if (isTokenExpiredError(e)) resetDb();
        return { success: false, error: "Erro ao alterar senha" };
    }
}

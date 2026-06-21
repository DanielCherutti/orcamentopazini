"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth-constants";
import { checkLoginRateLimitFromHeaders } from "@/lib/rate-limit";
import { verifySessionToken } from "@/lib/session-token";
import {
    assertTenantSession,
    getSessionContext,
    isImpersonationReadonly,
    setSessionContext,
} from "@/lib/tenant-context";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { verifyPassword } from "@/lib/password";
import { passwordHashLooksValid } from "@/lib/password-hash-present";
import { resolveLoginRedirect } from "@/actions/login-routing-actions";

const SESSION_MAX_AGE = 60 * 60 * 8;

function getSessionSecret(): string | undefined {
    const s = process.env.JWT_SECRET?.trim();
    return s && s.length >= 32 ? s : undefined;
}

export async function loginAction(formData: FormData) {
    const secret = getSessionSecret();
    if (!secret) {
        redirect("/?error=config");
    }

    const h = await headers();
    const rl = checkLoginRateLimitFromHeaders(h);
    if (!rl.ok) {
        redirect("/?error=ratelimit");
    }

    const email = formData.get("email")?.toString().trim().toLowerCase();
    const password = formData.get("password")?.toString();

    if (!email || !password) {
        redirect("/?error=invalid");
    }

    const db = await getDb();
    try {
        const rows = await db.query<
            [
                {
                    password_hash: string;
                    active?: boolean;
                }[],
            ]
        >(
            "SELECT password_hash, active FROM portal_user WHERE email = $email LIMIT 1",
            { email },
        );
        const row = rows[0]?.[0];
        const inactive = row?.active === false;

        if (row && !inactive && !passwordHashLooksValid(row.password_hash)) {
            redirect("/?error=pending");
        }

        const ok =
            row &&
            !inactive &&
            passwordHashLooksValid(row.password_hash) &&
            (await verifyPassword(password, row.password_hash));

        if (!ok) {
            redirect("/?error=invalid");
        }
    } catch (e) {
        console.error("loginAction:", e);
        if (isTokenExpiredError(e)) resetDb();
        redirect("/?error=invalid");
    }

    const nextPath = await resolveLoginRedirect(email);
    redirect(nextPath);
}

export async function logoutAction() {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE);
    redirect("/");
}

export async function getSession(): Promise<boolean> {
    const ctx = await getSessionContext();
    if (!ctx) return false;
    if (ctx.platformMode && !ctx.impersonation) return true;
    if (ctx.pending) return true;
    if (ctx.impersonation) return Boolean(ctx.tenantId && ctx.role);
    return Boolean(ctx.tenantId && ctx.role);
}

export async function getSessionEmail(): Promise<string | null> {
    const ctx = await getSessionContext();
    return ctx?.email ?? null;
}

/**
 * Server Actions de dados: exige sessão com tenant ativo (multi-tenant PAZINI-100).
 * Leituras em modo suporte readonly são permitidas.
 */
export async function assertActionSession(): Promise<
    { ok: true } | { ok: false; error: string }
> {
    const auth = await assertTenantSession();
    if (!auth.ok) return auth;
    return { ok: true };
}

/** Mutations — bloqueadas em impersonate readonly. */
export async function assertWriteActionSession(): Promise<
    { ok: true } | { ok: false; error: string }
> {
    const auth = await assertTenantSession();
    if (!auth.ok) return auth;
    const ctx = await getSessionContext();
    if (isImpersonationReadonly(ctx)) {
        return { ok: false, error: "Modo suporte (somente leitura)" };
    }
    return { ok: true };
}

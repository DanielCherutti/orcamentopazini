"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth-constants";
import { signSessionToken, verifySessionToken } from "@/lib/session-token";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { verifyPassword } from "@/lib/password";

const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

function getSessionSecret(): string | undefined {
    const s = process.env.JWT_SECRET?.trim();
    return s && s.length >= 32 ? s : undefined;
}

export async function loginAction(formData: FormData) {
    const secret = getSessionSecret();
    if (!secret) {
        redirect("/?error=config");
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
        const ok =
            row &&
            !inactive &&
            (await verifyPassword(password, row.password_hash));

        if (!ok) {
            redirect("/?error=invalid");
        }
    } catch (e) {
        console.error("loginAction:", e);
        if (isTokenExpiredError(e)) resetDb();
        redirect("/?error=invalid");
    }

    const token = await signSessionToken(email, secret, SESSION_MAX_AGE);

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: SESSION_MAX_AGE,
        path: "/",
    });

    redirect("/dashboard");
}

export async function logoutAction() {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE);
    redirect("/");
}

export async function getSession(): Promise<boolean> {
    const secret = getSessionSecret();
    if (!secret) return false;

    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION_COOKIE)?.value;
    if (!raw) return false;

    const sub = await verifySessionToken(raw, secret);
    return sub !== null;
}

/** E-mail do usuário logado (claim `sub` do token), ou null. */
export async function getSessionEmail(): Promise<string | null> {
    const secret = getSessionSecret();
    if (!secret) return null;

    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION_COOKIE)?.value;
    if (!raw) return null;

    return verifySessionToken(raw, secret);
}

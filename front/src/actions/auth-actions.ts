"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth-constants";
import { signSessionToken, verifySessionToken } from "@/lib/session-token";

const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

function getSessionSecret(): string | undefined {
    const s = process.env.JWT_SECRET?.trim();
    return s && s.length >= 32 ? s : undefined;
}

function getExpectedLogin(): { email: string; password: string } | null {
    const email = (
        process.env.PAZINI_LOGIN_EMAIL ||
        process.env.AUTH_EMAIL ||
        ""
    )
        .trim()
        .toLowerCase();
    const password =
        process.env.PAZINI_LOGIN_PASSWORD || process.env.AUTH_PASSWORD || "";
    if (!email || !password) return null;
    return { email, password };
}

export async function loginAction(formData: FormData) {
    const secret = getSessionSecret();
    if (!secret) {
        redirect("/?error=config");
    }

    const expected = getExpectedLogin();
    if (!expected) {
        redirect("/?error=config");
    }

    const email = formData.get("email")?.toString().trim().toLowerCase();
    const password = formData.get("password")?.toString();

    if (email !== expected.email || password !== expected.password) {
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

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";
import { verifySessionToken } from "@/lib/session-token";

function getSessionSecret(): string | undefined {
    const s = process.env.JWT_SECRET?.trim();
    return s && s.length >= 32 ? s : undefined;
}

async function verifyCookieValue(raw: string | undefined): Promise<boolean> {
    const secret = getSessionSecret();
    if (!secret || !raw) return false;
    const email = await verifySessionToken(raw, secret);
    return email !== null;
}

/** Rotas App Router que usam `cookies()` (export/import). */
export async function assertApiSession(): Promise<
    { ok: true } | { ok: false; error: string; status: number }
> {
    const secret = getSessionSecret();
    if (!secret) {
        return { ok: false, error: "Configuração de sessão inválida", status: 500 };
    }

    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION_COOKIE)?.value;
    if (!(await verifyCookieValue(raw))) {
        return { ok: false, error: "Não autorizado", status: 401 };
    }

    return { ok: true };
}

/** Rotas que recebem `NextRequest` (uploads). */
export async function requireApiSession(
    request: NextRequest,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
    const secret = getSessionSecret();
    if (!secret) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: "Configuração de sessão inválida" },
                { status: 500 },
            ),
        };
    }

    const raw = request.cookies.get(SESSION_COOKIE)?.value;
    if (!(await verifyCookieValue(raw))) {
        return {
            ok: false,
            response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }),
        };
    }

    return { ok: true };
}

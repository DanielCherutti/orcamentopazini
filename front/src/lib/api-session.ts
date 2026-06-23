import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";
import { verifySessionToken } from "@/lib/session-token";

import type { TenantRole } from "@/types/tenant-types";

export type ApiSessionContext = {
    email: string;
    tenantId: string;
    role: TenantRole;
};

function getSessionSecret(): string | undefined {
    const s = process.env.JWT_SECRET?.trim();
    return s && s.length >= 32 ? s : undefined;
}

/** Rotas App Router que usam `cookies()` (export/import). */
export async function assertApiSession(): Promise<
    { ok: true; ctx: ApiSessionContext } | { ok: false; error: string; status: number }
> {
    const secret = getSessionSecret();
    if (!secret) {
        return { ok: false, error: "Configuração de sessão inválida", status: 500 };
    }

    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION_COOKIE)?.value;
    const payload = raw ? await verifySessionToken(raw, secret) : null;
    if (!payload || payload.pending || !payload.tenantId || !payload.role) {
        return { ok: false, error: "Não autorizado", status: 401 };
    }

    return {
        ok: true,
        ctx: {
            email: payload.sub,
            tenantId: payload.tenantId,
            role: payload.role,
        },
    };
}

/** Rotas que recebem `NextRequest` (uploads). */
export async function requireApiSession(
    request: NextRequest,
): Promise<{ ok: true; ctx: ApiSessionContext } | { ok: false; response: NextResponse }> {
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
    if (!raw) {
        return {
            ok: false,
            response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }),
        };
    }

    const payload = await verifySessionToken(raw, secret);
    if (!payload || payload.pending || !payload.tenantId || !payload.role) {
        return {
            ok: false,
            response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }),
        };
    }

    return {
        ok: true,
        ctx: {
            email: payload.sub,
            tenantId: payload.tenantId,
            role: payload.role,
        },
    };
}

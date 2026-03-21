import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";
import {
    getApiRateLimitConfig,
    getClientIpFromHeaders,
    getSseLiveRateLimitConfig,
    getUploadPostRateLimitConfig,
    rateLimitConsume,
} from "@/lib/rate-limit";
import { verifySessionToken } from "@/lib/session-token";

/** Páginas acessíveis sem sessão (ex.: tela de login na raiz). */
const PUBLIC_PAGE_PATHS = ["/"];

function getSessionSecret(): string | undefined {
    const s = process.env.JWT_SECRET?.trim();
    return s && s.length >= 32 ? s : undefined;
}

function isPublicPage(pathname: string): boolean {
    return PUBLIC_PAGE_PATHS.some(
        (p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)),
    );
}

function jsonTooManyRequests(retryAfterSeconds: number) {
    return NextResponse.json(
        {
            success: false,
            error: "Muitas requisições. Aguarde e tente novamente.",
        },
        {
            status: 429,
            headers: { "Retry-After": String(retryAfterSeconds) },
        },
    );
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (pathname.startsWith("/_next")) {
        return NextResponse.next();
    }

    // Rotas /api: rate limit por IP (item 6 — antiautomação / abuso)
    if (pathname.startsWith("/api")) {
        const ip = getClientIpFromHeaders(request.headers);

        if (
            pathname.startsWith("/api/upload") &&
            request.method === "POST"
        ) {
            const u = getUploadPostRateLimitConfig();
            const ur = rateLimitConsume(`upload:${ip}`, u.max, u.windowMs);
            if (!ur.ok) return jsonTooManyRequests(ur.retryAfterSeconds);
        } else if (
            pathname.includes("/compositor/") &&
            pathname.endsWith("/live") &&
            request.method === "GET"
        ) {
            const s = getSseLiveRateLimitConfig();
            const sr = rateLimitConsume(`sse:${ip}`, s.max, s.windowMs);
            if (!sr.ok) return jsonTooManyRequests(sr.retryAfterSeconds);
        } else {
            const a = getApiRateLimitConfig();
            const ar = rateLimitConsume(`api:${ip}`, a.max, a.windowMs);
            if (!ar.ok) return jsonTooManyRequests(ar.retryAfterSeconds);
        }

        const secret = getSessionSecret();
        const raw = request.cookies.get(SESSION_COOKIE)?.value;

        if (!secret || !raw) {
            return NextResponse.json(
                { success: false, error: "Não autorizado" },
                { status: 401 },
            );
        }

        const sub = await verifySessionToken(raw, secret);
        if (!sub) {
            return NextResponse.json(
                { success: false, error: "Sessão inválida ou expirada" },
                { status: 401 },
            );
        }

        return NextResponse.next();
    }

    if (isPublicPage(pathname)) {
        return NextResponse.next();
    }

    const secret = getSessionSecret();
    const raw = request.cookies.get(SESSION_COOKIE)?.value;

    if (!secret || !raw) {
        const loginUrl = new URL("/", request.url);
        loginUrl.searchParams.set("error", "expired");
        return NextResponse.redirect(loginUrl);
    }

    const sub = await verifySessionToken(raw, secret);
    if (!sub) {
        const loginUrl = new URL("/", request.url);
        loginUrl.searchParams.set("error", "expired");
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

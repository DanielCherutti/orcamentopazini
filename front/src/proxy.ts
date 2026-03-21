import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";
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

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (pathname.startsWith("/_next")) {
        return NextResponse.next();
    }

    // Rotas /api: exigem sessão válida (item 2 — erros-sistema: não liberar API sem auth)
    if (pathname.startsWith("/api")) {
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

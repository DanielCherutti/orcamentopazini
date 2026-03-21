import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";
import { verifySessionToken } from "@/lib/session-token";

const PUBLIC_PATHS = ["/", "/api"];

function getSessionSecret(): string | undefined {
    const s = process.env.JWT_SECRET?.trim();
    return s && s.length >= 32 ? s : undefined;
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Allow public paths and static assets
    if (
        PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith("/api")) ||
        pathname.startsWith("/_next")
    ) {
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

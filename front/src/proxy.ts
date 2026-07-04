import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";
import {
    getApiRateLimitConfig,
    getClientIpFromHeaders,
    getSseLiveRateLimitConfig,
    getUploadPostRateLimitConfig,
    rateLimitConsume,
} from "@/lib/rate-limit";
import { verifySessionToken, type ImpersonationPayload } from "@/lib/session-token";
import { tenantMatchesHost } from "@/lib/tenant-host";
import { resolveTenantFromHost, resolveBrandingTenantFromHost } from "@/lib/tenant-host-resolve";
import { parseDeliveryProjectPathSegments } from "@/lib/delivery/delivery-path";

function normalizeDeliveryProjectPathname(pathname: string): string | null {
    const normalized = pathname.replace(/^\/delivery_projects(?=\/|$)/, "/delivery-projects");
    const match = normalized.match(/^\/delivery-projects\/(.+)$/);
    if (!match) return null;

    const rest = decodeURIComponent(match[1]);
    if (!rest) return null;

    if (!rest.includes("/") && !rest.includes(":") && !rest.startsWith("delivery_project")) {
        return null;
    }

    const segments = rest.split("/").filter(Boolean);
    const { canonicalPath } = parseDeliveryProjectPathSegments(segments);
    if (!canonicalPath) return null;

    const target = `/delivery-projects/${canonicalPath}`;
    if (target === normalized) return null;
    return target;
}

/** Páginas acesssíveis sem sessão completa (login, convite e seleção de tenant). */
const PUBLIC_PAGE_PATHS = ["/", "/select-tenant", "/convite"];

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

type SessionPayload = NonNullable<Awaited<ReturnType<typeof verifySessionToken>>>;

function isPlatformRoute(pathname: string): boolean {
    return pathname === "/platform" || pathname.startsWith("/platform/");
}

function isImpersonationExpired(imp: ImpersonationPayload): boolean {
    const exp = Date.parse(imp.expiresAt);
    return Number.isFinite(exp) && exp < Date.now();
}

function sessionAllowsPage(pathname: string, payload: SessionPayload): boolean {
    const impersonating = Boolean(payload.impersonation);

    if (payload.platformMode && !impersonating) {
        return isPlatformRoute(pathname);
    }

    if (impersonating && payload.impersonation) {
        if (isImpersonationExpired(payload.impersonation)) {
            return isPlatformRoute(pathname);
        }
        if (isPlatformRoute(pathname)) return false;
    }

    if (payload.pending) {
        return pathname === "/select-tenant" || pathname.startsWith("/select-tenant/");
    }
    if (!payload.tenantId || !payload.role) {
        return pathname === "/select-tenant" || pathname.startsWith("/select-tenant/");
    }
    if (isPlatformRoute(pathname)) {
        return false;
    }
    return true;
}

function apiSessionOk(payload: SessionPayload): boolean {
    if (payload.pending) return false;
    if (payload.platformMode && !payload.impersonation) return true;
    if (payload.impersonation && isImpersonationExpired(payload.impersonation)) return false;
    return Boolean(payload.tenantId);
}

function appendTenantHeaders(
    response: NextResponse,
    tenantId: string | null,
    resolutionKind: string,
): NextResponse {
    if (tenantId) response.headers.set("x-resolved-tenant-id", tenantId);
    response.headers.set("x-host-resolution", resolutionKind);
    return response;
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const hostHeader = request.headers.get("host");
    const hostResolved = await resolveTenantFromHost(hostHeader);

    const deliveryProjectPath = normalizeDeliveryProjectPathname(pathname);
    if (deliveryProjectPath) {
        const url = request.nextUrl.clone();
        url.pathname = deliveryProjectPath;
        return NextResponse.redirect(url);
    }

    if (pathname.startsWith("/_next")) {
        return NextResponse.next();
    }

    if (pathname.startsWith("/api")) {
        // Logos, favicons e mídia de orçamentos — leitura pública (login, favicon, PDF, canvas).
        if (
            pathname.startsWith("/api/uploads") &&
            (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS")
        ) {
            return NextResponse.next();
        }

        const ip = getClientIpFromHeaders(request.headers);

        if (pathname.startsWith("/api/upload") && request.method === "POST") {
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

        const payload = await verifySessionToken(raw, secret);
        if (!payload || !apiSessionOk(payload)) {
            return NextResponse.json(
                { success: false, error: "Sessão inválida ou expirada" },
                { status: 401 },
            );
        }

        if (
            hostResolved.tenant &&
            payload.tenantId &&
            !payload.platformMode &&
            !tenantMatchesHost(hostResolved.tenant, hostResolved.resolution)
        ) {
            return NextResponse.json(
                { success: false, error: "Organização não corresponde ao endereço" },
                { status: 403 },
            );
        }

        return appendTenantHeaders(
            NextResponse.next(),
            hostResolved.tenant?.id ?? payload.tenantId ?? null,
            hostResolved.resolution.kind,
        );
    }

    if (hostResolved.resolution.kind === "subdomain" || hostResolved.resolution.kind === "custom") {
        if (!hostResolved.tenant && isPublicPage(pathname)) {
            return NextResponse.next();
        }
        if (!hostResolved.tenant) {
            return new NextResponse("Organização não encontrada", { status: 404 });
        }
    }

    if (isPublicPage(pathname)) {
        const res = NextResponse.next();
        let tenantId = hostResolved.tenant?.id ?? null;
        if (!tenantId && (hostResolved.resolution.kind === "subdomain" || hostResolved.resolution.kind === "custom")) {
            const brandingResolved = await resolveBrandingTenantFromHost(hostHeader);
            tenantId = brandingResolved.tenant?.id ?? null;
        }
        if (tenantId) {
            res.headers.set("x-resolved-tenant-id", tenantId);
        }
        return res;
    }

    const secret = getSessionSecret();
    const raw = request.cookies.get(SESSION_COOKIE)?.value;

    if (!secret || !raw) {
        const loginUrl = new URL("/", request.url);
        loginUrl.searchParams.set("error", "expired");
        return NextResponse.redirect(loginUrl);
    }

    const payload = await verifySessionToken(raw, secret);
    if (!payload) {
        const loginUrl = new URL("/", request.url);
        loginUrl.searchParams.set("error", "expired");
        return NextResponse.redirect(loginUrl);
    }

    if (
        payload.impersonation &&
        isImpersonationExpired(payload.impersonation) &&
        !isPlatformRoute(pathname)
    ) {
        return NextResponse.redirect(new URL("/platform?impersonation=expired", request.url));
    }

    if (
        hostResolved.tenant &&
        payload.tenantId &&
        !payload.platformMode &&
        !tenantMatchesHost(hostResolved.tenant, hostResolved.resolution)
    ) {
        const loginUrl = new URL("/", request.url);
        loginUrl.searchParams.set("error", "host_mismatch");
        return NextResponse.redirect(loginUrl);
    }

    if (!sessionAllowsPage(pathname, payload)) {
        if (payload.platformMode && !payload.impersonation) {
            return NextResponse.redirect(new URL("/platform", request.url));
        }
        if (payload.impersonation) {
            return NextResponse.redirect(new URL("/dashboard", request.url));
        }
        const selectUrl = new URL("/select-tenant", request.url);
        return NextResponse.redirect(selectUrl);
    }

    return appendTenantHeaders(
        NextResponse.next(),
        hostResolved.tenant?.id ?? payload.tenantId ?? null,
        hostResolved.resolution.kind,
    );
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

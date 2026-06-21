import type { Tenant } from "@/types/tenant-types";

/** Hosts reservados — não podem ser subdomínio de tenant. */
export const RESERVED_SUBDOMAINS = new Set([
    "www",
    "app",
    "platform",
    "api",
    "admin",
    "mail",
    "smtp",
    "cdn",
    "static",
]);

export function getAppPrimaryHost(): string {
    const fromEnv =
        process.env.APP_PRIMARY_HOST?.trim() ||
        process.env.NEXT_PUBLIC_APP_PRIMARY_HOST?.trim();
    if (fromEnv) return fromEnv.toLowerCase().replace(/:\d+$/, "");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
    try {
        return new URL(appUrl).hostname.toLowerCase();
    } catch {
        return "localhost";
    }
}

export function getAppTenantDomain(): string {
    return (
        process.env.APP_TENANT_DOMAIN?.trim()?.toLowerCase() ||
        getAppPrimaryHost()
    );
}

function normalizeHost(host: string | null | undefined): string | null {
    if (!host) return null;
    const h = host.split(":")[0]?.trim().toLowerCase();
    return h || null;
}

export type HostTenantResolution =
    | { kind: "primary"; host: string }
    | { kind: "subdomain"; host: string; subdomain: string }
    | { kind: "custom"; host: string; customDomain: string }
    | { kind: "unknown"; host: string };

/** Resolve tipo de host sem consultar banco. */
export function resolveHostKind(hostHeader: string | null | undefined): HostTenantResolution {
    const host = normalizeHost(hostHeader);
    if (!host) return { kind: "unknown", host: "" };

    const primary = getAppPrimaryHost();
    const tenantDomain = getAppTenantDomain();

    if (host === primary || host === "localhost" || host === "127.0.0.1") {
        return { kind: "primary", host };
    }

    const suffix = `.${tenantDomain}`;
    if (host.endsWith(suffix) && host.length > suffix.length) {
        const subdomain = host.slice(0, -suffix.length).split(".")[0] ?? "";
        if (subdomain && !subdomain.includes(".") && !RESERVED_SUBDOMAINS.has(subdomain)) {
            return { kind: "subdomain", host, subdomain };
        }
    }

    return { kind: "custom", host, customDomain: host };
}

export function tenantMatchesHost(
    tenant: Pick<Tenant, "slug" | "subdomain" | "custom_domain" | "custom_domain_verified_at">,
    resolution: HostTenantResolution,
): boolean {
    if (resolution.kind === "primary" || resolution.kind === "unknown") return true;
    if (resolution.kind === "subdomain") {
        const sub = (tenant.subdomain ?? tenant.slug).toLowerCase();
        return sub === resolution.subdomain.toLowerCase();
    }
    if (resolution.kind === "custom") {
        if (!tenant.custom_domain_verified_at || !tenant.custom_domain) return false;
        return tenant.custom_domain.toLowerCase() === resolution.customDomain.toLowerCase();
    }
    return false;
}

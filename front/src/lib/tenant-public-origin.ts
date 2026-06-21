import { getAppTenantDomain } from "@/lib/tenant-host";
import type { Tenant } from "@/types/tenant-types";

type TenantOriginFields = Pick<
    Tenant,
    "slug" | "subdomain" | "custom_domain" | "custom_domain_verified_at"
>;

function originProtocol(): string {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (appUrl) {
        try {
            return new URL(appUrl).protocol.replace(":", "") || "https";
        } catch {
            /* fallthrough */
        }
    }
    return process.env.NODE_ENV === "production" ? "https" : "http";
}

/** URL pública base da org (convites, PDF, links). */
export function getTenantPublicOrigin(tenant: TenantOriginFields): string {
    const protocol = originProtocol();
    if (tenant.custom_domain_verified_at && tenant.custom_domain?.trim()) {
        return `${protocol}://${tenant.custom_domain.trim().toLowerCase()}`;
    }
    const sub = (tenant.subdomain ?? tenant.slug).trim().toLowerCase();
    const domain = getAppTenantDomain();
    return `${protocol}://${sub}.${domain}`;
}

export function getTenantLoginUrl(tenant: TenantOriginFields): string {
    return `${getTenantPublicOrigin(tenant)}/`;
}

import { getDb } from "@/lib/surreal";
import { recordIdToString } from "@/lib/surreal-record-ids";
import {
    getCachedHostTenantResolution,
    setCachedHostTenantResolution,
} from "@/lib/tenant-host-cache";
import {
    resolveHostKind,
    type ResolvedHostTenant,
} from "@/lib/tenant-host";
import type { Tenant } from "@/types/tenant-types";

export type { ResolvedHostTenant };

function serializeTenantRow(row: Record<string, unknown>): Tenant {
    return {
        id: recordIdToString(row.id) ?? "",
        name: String(row.name ?? ""),
        slug: String(row.slug ?? ""),
        active: row.active !== false,
        deleted_at: row.deleted_at != null ? String(row.deleted_at) : null,
        max_users: row.max_users != null ? Number(row.max_users) : null,
        license_plan: (["trial", "standard", "professional"].includes(String(row.license_plan ?? ""))
            ? String(row.license_plan)
            : "standard") as Tenant["license_plan"],
        license_expires_at:
            row.license_expires_at != null ? String(row.license_expires_at) : null,
        subdomain: row.subdomain != null ? String(row.subdomain) : null,
        custom_domain: row.custom_domain != null ? String(row.custom_domain) : null,
        custom_domain_verified_at:
            row.custom_domain_verified_at != null
                ? String(row.custom_domain_verified_at)
                : null,
        require_custom_host: row.require_custom_host === true,
    };
}

async function queryTenantBySubdomain(subdomain: string): Promise<Tenant | null> {
    const db = await getDb();
    const rows = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM tenant
         WHERE deleted_at IS NONE
           AND (subdomain = $sub OR (subdomain IS NONE AND slug = $sub))
         LIMIT 1`,
        { sub: subdomain.toLowerCase() },
    );
    const row = rows[0]?.[0];
    return row ? serializeTenantRow(row) : null;
}

async function queryTenantByVerifiedCustomDomain(domain: string): Promise<Tenant | null> {
    const db = await getDb();
    const rows = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM tenant
         WHERE deleted_at IS NONE
           AND custom_domain = $domain
           AND custom_domain_verified_at IS NOT NONE
         LIMIT 1`,
        { domain: domain.toLowerCase() },
    );
    const row = rows[0]?.[0];
    return row ? serializeTenantRow(row) : null;
}

async function queryTenantByCustomDomainBranding(domain: string): Promise<Tenant | null> {
    const db = await getDb();
    const rows = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM tenant
         WHERE deleted_at IS NONE
           AND custom_domain = $domain
         LIMIT 1`,
        { domain: domain.toLowerCase() },
    );
    const row = rows[0]?.[0];
    return row ? serializeTenantRow(row) : null;
}

/** Resolve tenant para exibição de marca (inclui domínio customizado ainda não verificado). */
export async function resolveBrandingTenantFromHost(
    hostHeader: string | null | undefined,
): Promise<ResolvedHostTenant> {
    const cached = getCachedHostTenantResolution("branding", hostHeader);
    if (cached) return cached;

    const resolved = await resolveTenantFromHost(hostHeader);
    if (resolved.tenant) {
        setCachedHostTenantResolution("branding", hostHeader, resolved);
        return resolved;
    }

    const resolution = resolveHostKind(hostHeader);
    if (resolution.kind !== "custom") {
        setCachedHostTenantResolution("branding", hostHeader, resolved);
        return resolved;
    }

    const tenant = await queryTenantByCustomDomainBranding(resolution.customDomain);
    const result: ResolvedHostTenant = { resolution, tenant };
    setCachedHostTenantResolution("branding", hostHeader, result);
    return result;
}

/** Resolve tenant a partir do header Host (subdomínio ou domínio customizado verificado). */
export async function resolveTenantFromHost(
    hostHeader: string | null | undefined,
): Promise<ResolvedHostTenant> {
    const resolution = resolveHostKind(hostHeader);
    if (resolution.kind === "primary" || resolution.kind === "unknown") {
        return { resolution, tenant: null };
    }

    const cached = getCachedHostTenantResolution("session", hostHeader);
    if (cached) return cached;

    let tenant: Tenant | null = null;
    if (resolution.kind === "subdomain") {
        tenant = await queryTenantBySubdomain(resolution.subdomain);
    } else {
        tenant = await queryTenantByVerifiedCustomDomain(resolution.customDomain);
    }

    const result: ResolvedHostTenant = { resolution, tenant };
    setCachedHostTenantResolution("session", hostHeader, result);
    return result;
}

import { StringRecordId } from "surrealdb";

import { getDb } from "@/lib/surreal";
import { recordIdToString } from "@/lib/surreal-record-ids";
import {
    resolveHostKind,
    type HostTenantResolution,
} from "@/lib/tenant-host";
import type { Tenant } from "@/types/tenant-types";

export type ResolvedHostTenant = {
    resolution: HostTenantResolution;
    tenant: Tenant | null;
};

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

/** Resolve tenant para exibição de marca (inclui domínio customizado ainda não verificado). */
export async function resolveBrandingTenantFromHost(
    hostHeader: string | null | undefined,
): Promise<ResolvedHostTenant> {
    const resolved = await resolveTenantFromHost(hostHeader);
    if (resolved.tenant) return resolved;

    const resolution = resolveHostKind(hostHeader);
    if (resolution.kind !== "custom") {
        return resolved;
    }

    const db = await getDb();
    const rows = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM tenant
         WHERE deleted_at IS NONE
           AND custom_domain = $domain
         LIMIT 1`,
        { domain: resolution.customDomain.toLowerCase() },
    );
    const row = rows[0]?.[0];
    return { resolution, tenant: row ? serializeTenantRow(row) : null };
}

/** Resolve tenant a partir do header Host (subdomínio ou domínio customizado). */
export async function resolveTenantFromHost(
    hostHeader: string | null | undefined,
): Promise<ResolvedHostTenant> {
    const resolution = resolveHostKind(hostHeader);
    if (resolution.kind === "primary" || resolution.kind === "unknown") {
        return { resolution, tenant: null };
    }

    const db = await getDb();
    if (resolution.kind === "subdomain") {
        const rows = await db.query<[Array<Record<string, unknown>>]>(
            `SELECT * FROM tenant
             WHERE deleted_at IS NONE
               AND (subdomain = $sub OR (subdomain IS NONE AND slug = $sub))
             LIMIT 1`,
            { sub: resolution.subdomain.toLowerCase() },
        );
        const row = rows[0]?.[0];
        return { resolution, tenant: row ? serializeTenantRow(row) : null };
    }

    const rows = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM tenant
         WHERE deleted_at IS NONE
           AND custom_domain = $domain
           AND custom_domain_verified_at IS NOT NONE
         LIMIT 1`,
        { domain: resolution.customDomain.toLowerCase() },
    );
    const row = rows[0]?.[0];
    return { resolution, tenant: row ? serializeTenantRow(row) : null };
}

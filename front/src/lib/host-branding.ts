import { headers } from "next/headers";

import {
    BRAND_DEFAULT_PRIMARY,
    BRAND_DEFAULT_SECONDARY,
    normalizeHex,
} from "@/lib/branding-theme";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/product-brand";
import { resolveHostKind } from "@/lib/tenant-host";
import { resolveTenantFromHost } from "@/lib/tenant-host-resolve";
import { getDb, isTokenExpiredError, resetDb } from "@/lib/surreal";
import { tenantRecordId } from "@/lib/tenant-query";

export type HostDisplayBranding = {
    company_name: string;
    company_header_subtitle?: string;
    company_logo_url?: string;
    primary_color: string;
    secondary_color: string;
    /** Host principal do produto (localhost / app.enghub…) — marca EngHub, não org cliente. */
    isProductHost: boolean;
};

export function getProductDisplayBranding(): HostDisplayBranding {
    return {
        company_name: PRODUCT_NAME,
        company_header_subtitle: undefined,
        primary_color: BRAND_DEFAULT_PRIMARY,
        secondary_color: BRAND_DEFAULT_SECONDARY,
        isProductHost: true,
    };
}

async function loadTenantPublicBranding(tenantId: string): Promise<HostDisplayBranding | null> {
    try {
        const db = await getDb();
        const result = await db.query<
            [
                {
                    primary_color?: string;
                    secondary_color?: string;
                    company_name?: string;
                    company_logo_url?: string;
                    company_header_subtitle?: string;
                }[],
            ]
        >(
            `SELECT primary_color, secondary_color, company_name, company_logo_url, company_header_subtitle
             FROM proposal_settings WHERE tenant_id = $tenantId LIMIT 1`,
            { tenantId: tenantRecordId(tenantId) },
        );
        const row = result[0]?.[0];
        if (!row) return null;

        const primary =
            normalizeHex(row.primary_color != null ? String(row.primary_color) : undefined) ??
            BRAND_DEFAULT_PRIMARY;
        const secondary =
            normalizeHex(row.secondary_color != null ? String(row.secondary_color) : undefined) ??
            BRAND_DEFAULT_SECONDARY;

        const companyName = row.company_name != null ? String(row.company_name).trim() : "";
        if (!companyName) return null;

        return {
            company_name: companyName,
            company_header_subtitle:
                row.company_header_subtitle != null
                    ? String(row.company_header_subtitle).trim() || undefined
                    : undefined,
            company_logo_url:
                row.company_logo_url != null && String(row.company_logo_url).trim() !== ""
                    ? String(row.company_logo_url).trim()
                    : undefined,
            primary_color: primary,
            secondary_color: secondary,
            isProductHost: false,
        };
    } catch (error) {
        console.error("loadTenantPublicBranding:", error);
        if (isTokenExpiredError(error)) resetDb();
        return null;
    }
}

async function resolveHostHeader(): Promise<string | null> {
    const h = await headers();
    return h.get("x-forwarded-host") ?? h.get("host");
}

/** Marca exibida no login e no shell conforme o Host (produto vs org por subdomínio). */
export async function getHostDisplayBranding(): Promise<HostDisplayBranding> {
    const host = await resolveHostHeader();
    const resolution = resolveHostKind(host);

    if (resolution.kind === "primary") {
        return getProductDisplayBranding();
    }

    const { tenant } = await resolveTenantFromHost(host);
    if (!tenant?.id) {
        return getProductDisplayBranding();
    }

    const tenantBranding = await loadTenantPublicBranding(tenant.id);
    if (tenantBranding) {
        return tenantBranding;
    }

    return {
        company_name: tenant.name.trim() || tenant.slug,
        primary_color: BRAND_DEFAULT_PRIMARY,
        secondary_color: BRAND_DEFAULT_SECONDARY,
        isProductHost: false,
    };
}

/** Texto auxiliar abaixo do nome no login. */
export function loginSubtitleForBranding(branding: HostDisplayBranding): string {
    if (branding.isProductHost) {
        return `${PRODUCT_TAGLINE} — entre com sua conta do portal`;
    }
    return "Entre com sua conta do portal";
}

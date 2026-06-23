import type { Metadata } from "next";
import { headers } from "next/headers";

import {
    BRAND_DEFAULT_PRIMARY,
    BRAND_DEFAULT_SECONDARY,
    normalizeHex,
} from "@/lib/branding-theme";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/product-brand";
import { resolveHostKind, type HostTenantResolution } from "@/lib/tenant-host";
import { resolveBrandingTenantFromHost } from "@/lib/tenant-host-resolve";
import { getDb, isTokenExpiredError, resetDb } from "@/lib/surreal";
import { tenantRecordId } from "@/lib/tenant-query";

export type HostDisplayBranding = {
    company_name: string;
    company_header_subtitle?: string;
    company_logo_url?: string;
    company_favicon_url?: string;
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

function fallbackNameForOrgHost(resolution: HostTenantResolution): string {
    if (resolution.kind === "subdomain") {
        return resolution.subdomain;
    }
    if (resolution.kind === "custom") {
        return resolution.customDomain;
    }
    return "Empresa";
}

async function loadTenantPublicBranding(
    tenantId: string,
    tenantDisplayName: string,
): Promise<HostDisplayBranding> {
    try {
        const db = await getDb();
        const result = await db.query<
            [
                {
                    primary_color?: string;
                    secondary_color?: string;
                    company_name?: string;
                    company_logo_url?: string;
                    company_favicon_url?: string;
                    company_header_subtitle?: string;
                }[],
            ]
        >(
            `SELECT primary_color, secondary_color, company_name, company_logo_url, company_favicon_url, company_header_subtitle
             FROM proposal_settings WHERE tenant_id = $tenantId LIMIT 1`,
            { tenantId: tenantRecordId(tenantId) },
        );
        const row = result[0]?.[0];

        const primary =
            normalizeHex(row?.primary_color != null ? String(row.primary_color) : undefined) ??
            BRAND_DEFAULT_PRIMARY;
        const secondary =
            normalizeHex(row?.secondary_color != null ? String(row.secondary_color) : undefined) ??
            BRAND_DEFAULT_SECONDARY;

        const configuredName =
            row?.company_name != null ? String(row.company_name).trim() : "";
        const companyName = configuredName || tenantDisplayName.trim() || "Empresa";

        return {
            company_name: companyName,
            company_header_subtitle:
                row?.company_header_subtitle != null
                    ? String(row.company_header_subtitle).trim() || undefined
                    : undefined,
            company_logo_url:
                row?.company_logo_url != null && String(row.company_logo_url).trim() !== ""
                    ? String(row.company_logo_url).trim()
                    : undefined,
            company_favicon_url:
                row?.company_favicon_url != null && String(row.company_favicon_url).trim() !== ""
                    ? String(row.company_favicon_url).trim()
                    : undefined,
            primary_color: primary,
            secondary_color: secondary,
            isProductHost: false,
        };
    } catch (error) {
        console.error("loadTenantPublicBranding:", error);
        if (isTokenExpiredError(error)) resetDb();
        return {
            company_name: tenantDisplayName.trim() || "Empresa",
            primary_color: BRAND_DEFAULT_PRIMARY,
            secondary_color: BRAND_DEFAULT_SECONDARY,
            isProductHost: false,
        };
    }
}

async function resolveHostHeader(): Promise<string | null> {
    const h = await headers();
    return h.get("x-forwarded-host") ?? h.get("host");
}

async function resolveTenantIdFromHeaders(): Promise<string | null> {
    const h = await headers();
    const fromProxy = h.get("x-resolved-tenant-id")?.trim();
    return fromProxy || null;
}

/** Marca exibida no login, convite e shell conforme o Host (produto vs org). */
export async function getHostDisplayBranding(): Promise<HostDisplayBranding> {
    const host = await resolveHostHeader();
    const resolution = resolveHostKind(host);

    if (resolution.kind === "primary") {
        return getProductDisplayBranding();
    }

    const headerTenantId = await resolveTenantIdFromHeaders();
    const { tenant } = await resolveBrandingTenantFromHost(host);
    const tenantId = tenant?.id ?? headerTenantId;
    const tenantName = tenant?.name ?? "";

    if (tenantId) {
        return loadTenantPublicBranding(tenantId, tenantName);
    }

    return {
        company_name: fallbackNameForOrgHost(resolution),
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
    if (branding.company_header_subtitle) {
        return `${branding.company_header_subtitle} — entre com sua conta do portal`;
    }
    return "Entre com sua conta do portal";
}

/** Título da aba do browser conforme host (EngHub vs nome da org). */
export async function buildHostPageMetadata(pageTitle?: string): Promise<Metadata> {
    const branding = await getHostDisplayBranding();
    const title = pageTitle ?? (branding.isProductHost ? "Entrar" : branding.company_name);
    const metadata: Metadata = {
        title: {
            default: title,
            template: `%s | ${branding.company_name}`,
        },
        description: branding.isProductHost
            ? PRODUCT_TAGLINE
            : `${branding.company_name} — portal comercial`,
    };
    if (branding.company_favicon_url) {
        metadata.icons = {
            icon: branding.company_favicon_url,
            shortcut: branding.company_favicon_url,
        };
    }
    return metadata;
}

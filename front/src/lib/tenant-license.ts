import type { Tenant } from "@/types/tenant-types";

export type TenantAccessBlockReason = "inactive" | "expired";

export type TenantLicenseFields = Pick<
    Tenant,
    "active" | "license_expires_at"
>;

/** Org inativa ou licença vencida — null se acesso permitido. */
export function getTenantAccessBlockReason(
    tenant: TenantLicenseFields,
    now = new Date(),
): TenantAccessBlockReason | null {
    if (tenant.active === false) return "inactive";
    const exp = tenant.license_expires_at?.trim();
    if (!exp) return null;
    const expiresAt = Date.parse(exp);
    if (Number.isNaN(expiresAt)) return null;
    if (expiresAt < now.getTime()) return "expired";
    return null;
}

export function tenantAccessErrorMessage(
    reason: TenantAccessBlockReason,
): string {
    if (reason === "inactive") {
        return "Esta organização está desativada. Contate o suporte da plataforma.";
    }
    return "A licença desta organização expirou. Contate o suporte para renovar.";
}

export function tenantAccessLoginErrorParam(
    reason: TenantAccessBlockReason,
): "org_inactive" | "license_expired" {
    return reason === "inactive" ? "org_inactive" : "license_expired";
}

export function isTenantLicenseValid(
    tenant: TenantLicenseFields,
    now = new Date(),
): boolean {
    return getTenantAccessBlockReason(tenant, now) === null;
}

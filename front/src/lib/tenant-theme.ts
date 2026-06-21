export type TenantAppearance = "dark" | "light";

export const TENANT_APPEARANCE_STORAGE_KEY = "pazini-tenant-appearance";

export function isTenantAppearance(value: string | null | undefined): value is TenantAppearance {
    return value === "dark" || value === "light";
}

export function readStoredTenantAppearance(): TenantAppearance {
    if (typeof window === "undefined") return "dark";
    try {
        const stored = localStorage.getItem(TENANT_APPEARANCE_STORAGE_KEY);
        return isTenantAppearance(stored) ? stored : "dark";
    } catch {
        return "dark";
    }
}

export function persistTenantAppearance(appearance: TenantAppearance): void {
    try {
        localStorage.setItem(TENANT_APPEARANCE_STORAGE_KEY, appearance);
    } catch {
        /* ignore quota / private mode */
    }
}

export function applyTenantAppearanceToDocument(appearance: TenantAppearance): void {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.tenantTheme = appearance;
}

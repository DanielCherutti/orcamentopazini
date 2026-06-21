import type { PlatformPermission, PlatformRole } from "@/types/platform-types";

const ROLE_PERMISSIONS: Record<PlatformRole, ReadonlySet<PlatformPermission>> = {
    super_admin: new Set([
        "dashboard.view",
        "orgs.export_csv",
        "orgs.view",
        "orgs.write",
        "licenses.view",
        "licenses.write",
        "billing.view",
        "billing.write",
        "audit.view",
        "audit.export",
        "impersonate.readonly",
        "impersonate.full",
        "team.manage",
    ]),
    commercial: new Set([
        "dashboard.view",
        "orgs.export_csv",
        "orgs.view",
        "orgs.write",
        "licenses.view",
        "licenses.write",
        "billing.view",
        "billing.write",
        "audit.view",
        "audit.export",
    ]),
    support: new Set([
        "dashboard.view",
        "orgs.view",
        "licenses.view",
        "billing.view",
        "audit.view",
        "impersonate.readonly",
    ]),
    readonly: new Set([
        "dashboard.view",
        "orgs.view",
        "licenses.view",
        "billing.view",
        "audit.view",
    ]),
};

export function platformRoleHasPermission(
    role: PlatformRole | null | undefined,
    permission: PlatformPermission,
): boolean {
    if (!role) return false;
    return ROLE_PERMISSIONS[role].has(permission);
}

export function platformRoleCanImpersonate(
    role: PlatformRole | null | undefined,
    mode: "readonly" | "full",
): boolean {
    if (mode === "full") return platformRoleHasPermission(role, "impersonate.full");
    return platformRoleHasPermission(role, "impersonate.readonly");
}

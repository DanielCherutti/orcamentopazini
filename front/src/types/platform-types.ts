/** Papéis de usuário da plataforma SaaS (/platform). */
export type PlatformRole = "super_admin" | "commercial" | "support" | "readonly";

export type PlatformPermission =
    | "dashboard.view"
    | "orgs.export_csv"
    | "orgs.view"
    | "orgs.write"
    | "licenses.view"
    | "licenses.write"
    | "billing.view"
    | "billing.write"
    | "audit.view"
    | "audit.export"
    | "impersonate.readonly"
    | "impersonate.full"
    | "team.manage";

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
    super_admin: "Super Admin",
    commercial: "Comercial",
    support: "Suporte",
    readonly: "Somente leitura",
};

export const INVITABLE_PLATFORM_ROLES: PlatformRole[] = [
    "commercial",
    "support",
    "readonly",
];

export function isPlatformRole(value: unknown): value is PlatformRole {
    return (
        value === "super_admin" ||
        value === "commercial" ||
        value === "support" ||
        value === "readonly"
    );
}

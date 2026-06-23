import type { Tenant, TenantLicensePlan } from "@/types/tenant-types";
import { daysUntilExpiry } from "@/lib/platform-license";
import { cn } from "@/lib/utils";

export const PLAN_LABELS: Record<TenantLicensePlan, string> = {
    trial: "Trial",
    standard: "Standard",
    professional: "Professional",
};

export function orgInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase() || "?";
}

export function initialsFromEmail(email: string | null | undefined): string {
    if (!email) return "?";
    const local = email.split("@")[0] ?? email;
    const parts = local.split(/[.\s_-]+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    }
    return local.slice(0, 2).toUpperCase();
}

export function PlanBadge({
    plan,
    className,
}: {
    plan?: TenantLicensePlan | null;
    className?: string;
}) {
    const p = plan ?? "standard";
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                p === "trial" &&
                    "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-300",
                p === "standard" &&
                    "bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-300",
                p === "professional" &&
                    "bg-violet-500/10 text-violet-700 ring-violet-500/25 dark:text-violet-300",
                className,
            )}
        >
            {PLAN_LABELS[p]}
        </span>
    );
}

export type OrgLicenseStatus = "active" | "inactive" | "expiring" | "expired";

export function getOrganizationLicenseStatus(org: Pick<Tenant, "active" | "license_expires_at">): OrgLicenseStatus {
    if (org.active === false) return "inactive";
    const days = daysUntilExpiry(org.license_expires_at);
    if (days != null && days < 0) return "expired";
    if (days != null && days <= 30) return "expiring";
    return "active";
}

export function LicenseStatusBadge({
    org,
}: {
    org: Pick<Tenant, "active" | "license_expires_at">;
}) {
    const status = getOrganizationLicenseStatus(org);
    if (status === "inactive") {
        return <span className="inline-flex rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-500/20">Inativa</span>;
    }
    if (status === "expired") {
        return <span className="inline-flex rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-500/20">Vencida</span>;
    }
    if (status === "expiring") {
        return <span className="inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-500/20">Vencendo</span>;
    }
    return (
        <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-400">
            Ativa
        </span>
    );
}

export function OrgAvatar({
    name,
    className,
    size = "md",
}: {
    name: string;
    className?: string;
    size?: "sm" | "md" | "lg";
}) {
    const sizeClass =
        size === "sm" ? "h-8 w-8 text-[10px]" : size === "lg" ? "h-14 w-14 text-base" : "h-10 w-10 text-xs";
    return (
        <div
            className={cn(
                "flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/90 to-indigo-600 font-bold text-white shadow-sm ring-1 ring-white/10",
                sizeClass,
                className,
            )}
            aria-hidden
        >
            {orgInitials(name)}
        </div>
    );
}

export function UsageBar({
    used,
    max,
}: {
    used: number;
    max: number | null | undefined;
}) {
    if (max == null || max <= 0) {
        return (
            <span className="text-sm text-muted-foreground tabular-nums">
                {used} <span className="text-xs">(sem limite)</span>
            </span>
        );
    }
    const pct = Math.min(100, Math.round((used / max) * 100));
    const warn = pct >= 90;
    return (
        <div className="min-w-[120px] space-y-1.5">
            <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className={cn("font-medium tabular-nums", warn && "text-amber-600 dark:text-amber-400")}>
                    {used}/{max}
                </span>
                <span className="text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                    className={cn(
                        "h-full rounded-full transition-all",
                        warn ? "bg-amber-500" : "bg-violet-500",
                    )}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

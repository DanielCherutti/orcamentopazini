"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Building2,
    CreditCard,
    LayoutDashboard,
    LogOut,
    ScrollText,
    Shield,
    Users,
} from "lucide-react";
import { logoutAction } from "@/actions/auth-actions";
import { PlatformBreadcrumbProvider } from "@/components/layout/platform-breadcrumb-context";
import { PlatformSidebarProvider, usePlatformSidebar } from "@/components/layout/platform-sidebar-context";
import { PlatformCommandBar } from "@/components/platform/platform-command-bar";
import { cn } from "@/lib/utils";
import { usePlatformPermissions } from "@/components/platform/platform-permissions-context";
import type { PlatformRole } from "@/types/platform-types";
import { PRODUCT_NAME } from "@/lib/product-brand";

const SIDEBAR_COLLAPSED = "5rem";
const SIDEBAR_EXPANDED = "16rem";

function NavItem({
    href,
    icon: Icon,
    label,
    active,
    collapsed,
}: {
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    active: boolean;
    collapsed: boolean;
}) {
    if (collapsed) {
        return (
            <Link
                href={href}
                title={label}
                className={cn(
                    "platform-ops-rail-link group relative flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-200",
                    active
                        ? "bg-violet-500/25 text-white shadow-[0_0_28px_-4px_rgba(139,92,246,0.9)] ring-1 ring-violet-400/50"
                        : "text-violet-300/45 hover:bg-white/[0.06] hover:text-violet-100",
                )}
            >
                {active ? (
                    <span
                        className="absolute -left-3 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,0.9)]"
                        aria-hidden
                    />
                ) : null}
                <Icon className="h-5 w-5" />
            </Link>
        );
    }

    return (
        <Link
            href={href}
            className={cn(
                "platform-ops-nav-link relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200",
                active
                    ? "bg-violet-500/25 text-white shadow-[0_0_28px_-4px_rgba(139,92,246,0.5)] ring-1 ring-violet-400/40"
                    : "text-violet-300/70 hover:bg-white/[0.06] hover:text-violet-100",
            )}
        >
            {active ? (
                <span
                    className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,0.9)]"
                    aria-hidden
                />
            ) : null}
            <Icon className="h-5 w-5 shrink-0" />
            <span className="truncate">{label}</span>
        </Link>
    );
}

function PlatformOpsLayout({
    children,
    sessionEmail,
    platformRole,
}: {
    children: React.ReactNode;
    sessionEmail: string | null;
    platformRole: PlatformRole;
}) {
    const { can } = usePlatformPermissions();
    const { collapsed } = usePlatformSidebar();
    const pathname = usePathname() ?? "";

    const isDashboard = pathname === "/platform" || pathname === "/platform/";
    const isOrgs =
        pathname === "/platform/organizations" ||
        pathname.startsWith("/platform/organizations/");
    const isLicenses =
        pathname === "/platform/licenses" || pathname.startsWith("/platform/licenses/");
    const isTeam =
        pathname === "/platform/team" ||
        pathname.startsWith("/platform/team/") ||
        pathname === "/platform/admins";
    const isAudit = pathname === "/platform/audit" || pathname.startsWith("/platform/audit/");

    const nav = [
        { href: "/platform", icon: LayoutDashboard, label: "Mission Control", active: isDashboard },
        { href: "/platform/organizations", icon: Building2, label: "Organizações", active: isOrgs },
        { href: "/platform/licenses", icon: CreditCard, label: "Planos", active: isLicenses },
        ...(can("audit.view")
            ? [{ href: "/platform/audit", icon: ScrollText, label: "Auditoria", active: isAudit }]
            : []),
        ...(can("team.manage")
            ? [{ href: "/platform/team", icon: Users, label: "Equipe", active: isTeam }]
            : []),
    ] as const;

    return (
        <div className="platform-app platform-ops min-h-dvh bg-[#07060d]">
            <aside
                className={cn(
                    "platform-ops-rail fixed inset-y-0 left-0 z-30 flex flex-col border-r border-violet-500/15 py-4 transition-[width] duration-300 ease-in-out",
                    collapsed ? "w-20 items-center" : "w-64 items-stretch px-3",
                )}
                aria-label="Navegação EngHub"
                aria-expanded={!collapsed}
            >
                {collapsed ? (
                    <Link
                        href="/platform"
                        className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-indigo-500 to-violet-700 shadow-[0_0_32px_-4px_rgba(139,92,246,0.85)] ring-1 ring-violet-300/30"
                        title={PRODUCT_NAME}
                    >
                        <Shield className="h-6 w-6 text-white" />
                    </Link>
                ) : (
                    <Link
                        href="/platform"
                        className="mb-6 flex items-center gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/10 px-3 py-3 transition-colors hover:border-violet-400/40 hover:bg-violet-500/15"
                    >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-indigo-500 to-violet-700 shadow-[0_0_24px_-4px_rgba(139,92,246,0.85)] ring-1 ring-violet-300/30">
                            <Shield className="h-5 w-5 text-white" />
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-[10px] font-black uppercase tracking-[0.22em] text-violet-400/80">
                                {PRODUCT_NAME}
                            </p>
                            <p className="truncate text-sm font-bold text-white">Mission Control</p>
                        </div>
                    </Link>
                )}

                <nav
                    className={cn(
                        "flex flex-1 flex-col gap-1",
                        collapsed ? "items-center" : "min-h-0 overflow-y-auto",
                    )}
                >
                    {nav.map((item) => (
                        <NavItem key={item.href} {...item} collapsed={collapsed} />
                    ))}
                </nav>

                <form action={logoutAction} className={cn("mt-auto pt-4", !collapsed && "px-0")}>
                    <button
                        type="submit"
                        title="Sair"
                        className={cn(
                            "flex items-center justify-center rounded-xl border border-white/10 text-violet-300/50 transition-colors hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300",
                            collapsed ? "h-11 w-11" : "w-full gap-3 px-3 py-2.5 text-sm font-medium",
                        )}
                    >
                        <LogOut className="h-4 w-4 shrink-0" />
                        {!collapsed ? <span>Sair</span> : null}
                    </button>
                </form>
            </aside>

            <div
                className="flex min-h-dvh flex-col transition-[padding-left] duration-300 ease-in-out"
                style={{ paddingLeft: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED }}
            >
                <PlatformCommandBar sessionEmail={sessionEmail} platformRole={platformRole} />
                <main className="platform-ops-main relative flex-1">{children}</main>
            </div>
        </div>
    );
}

export function PlatformShell({
    children,
    sessionEmail,
    platformRole,
}: {
    children: React.ReactNode;
    sessionEmail: string | null;
    platformRole: PlatformRole;
}) {
    return (
        <PlatformSidebarProvider>
            <PlatformBreadcrumbProvider>
                <PlatformOpsLayout sessionEmail={sessionEmail} platformRole={platformRole}>
                    {children}
                </PlatformOpsLayout>
            </PlatformBreadcrumbProvider>
        </PlatformSidebarProvider>
    );
}

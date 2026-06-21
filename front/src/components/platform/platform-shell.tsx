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
    Sparkles,
    Users,
} from "lucide-react";
import { logoutAction } from "@/actions/auth-actions";
import { PlatformBreadcrumbProvider } from "@/components/layout/platform-breadcrumb-context";
import {
    PlatformSidebarProvider,
    usePlatformSidebar,
} from "@/components/layout/platform-sidebar-context";
import { PlatformHeader } from "@/components/platform/platform-header";
import { PlatformOrgAccessButton } from "@/components/platform/platform-org-access-button";
import { cn } from "@/lib/utils";
import { initialsFromEmail } from "@/components/platform/platform-utils";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/product-brand";
import { usePlatformPermissions } from "@/components/platform/platform-permissions-context";
import { PLATFORM_ROLE_LABELS, type PlatformRole } from "@/types/platform-types";

const SIDEBAR_EXPANDED = "17rem";
const SIDEBAR_COLLAPSED = "4.75rem";

function NavLink({
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
    return (
        <Link
            href={href}
            title={collapsed ? label : undefined}
            className={cn(
                "group relative flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200",
                collapsed ? "justify-center px-0 py-3" : "px-3 py-2.5",
                active
                    ? "platform-nav-active text-white"
                    : "text-slate-300 hover:bg-white/[0.1] hover:text-white",
            )}
        >
            <Icon
                className={cn(
                    "h-[1.125rem] w-[1.125rem] shrink-0 transition-colors",
                    active ? "text-white" : "text-slate-400 group-hover:text-violet-300",
                )}
            />
            {!collapsed ? <span className="truncate">{label}</span> : null}
            {active && !collapsed ? (
                <span
                    className="absolute right-2 h-1.5 w-1.5 rounded-full bg-white/90"
                    aria-hidden
                />
            ) : null}
        </Link>
    );
}

function PlatformShellInner({
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

    const navItems = [
        { href: "/platform", icon: LayoutDashboard, label: "Dashboard", active: isDashboard },
        {
            href: "/platform/organizations",
            icon: Building2,
            label: "Organizações",
            active: isOrgs,
        },
        {
            href: "/platform/licenses",
            icon: CreditCard,
            label: "Planos e preços",
            active: isLicenses,
        },
        ...(can("audit.view")
            ? [{ href: "/platform/audit", icon: ScrollText, label: "Auditoria", active: isAudit }]
            : []),
        ...(can("team.manage")
            ? [{ href: "/platform/team", icon: Users, label: "Equipe", active: isTeam }]
            : []),
    ] as const;

    return (
        <div
            className="platform-app min-h-dvh"
            style={
                {
                    "--platform-sidebar-width": collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED,
                } as React.CSSProperties
            }
        >
            <aside
                className={cn(
                    "platform-sidebar-surface fixed inset-y-0 left-0 z-30 flex flex-col bg-[#110f1a] text-slate-100 transition-[width] duration-300 ease-in-out",
                    collapsed ? "w-[4.75rem]" : "w-[17rem]",
                )}
                aria-label="Admin da plataforma"
            >
                <div
                    className={cn(
                        "border-b border-white/[0.06] px-4 py-5",
                        collapsed ? "flex justify-center" : "px-5",
                    )}
                >
                    <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
                        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-900/40">
                            <Shield className="h-5 w-5 text-white" />
                            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 ring-2 ring-[#110f1a]">
                                <Sparkles className="h-2.5 w-2.5 text-emerald-950" />
                            </span>
                        </div>
                        {!collapsed ? (
                            <div className="min-w-0">
                                <p className="text-base font-bold tracking-tight text-white">
                                    {PRODUCT_NAME}
                                </p>
                                <p className="text-[11px] leading-snug text-slate-500">
                                    {PRODUCT_TAGLINE}
                                </p>
                            </div>
                        ) : null}
                    </div>
                </div>

                <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
                    {!collapsed ? (
                        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                            Operação
                        </p>
                    ) : null}
                    {navItems.map((item) => (
                        <NavLink
                            key={item.href}
                            href={item.href}
                            icon={item.icon}
                            label={item.label}
                            active={item.active}
                            collapsed={collapsed}
                        />
                    ))}
                </nav>

                <div className="border-t border-white/[0.06] p-3">
                    {!collapsed ? (
                        <>
                            <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] p-3">
                                <div
                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-bold text-white"
                                    aria-hidden
                                >
                                    {initialsFromEmail(sessionEmail)}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-medium text-slate-200">
                                        {sessionEmail ?? "—"}
                                    </p>
                                    <p className="text-[10px] text-slate-500">
                                        {PLATFORM_ROLE_LABELS[platformRole]}
                                    </p>
                                </div>
                            </div>
                            <PlatformOrgAccessButton />
                        </>
                    ) : null}
                    <form action={logoutAction} className={collapsed ? "flex justify-center" : undefined}>
                        <button
                            type="submit"
                            title={collapsed ? "Sair" : undefined}
                            className={cn(
                                "flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-slate-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white",
                                collapsed ? "h-11 w-11 p-0" : "w-full px-3 py-2.5",
                            )}
                        >
                            <LogOut className="h-4 w-4 shrink-0" />
                            {!collapsed ? "Sair" : null}
                        </button>
                    </form>
                </div>
            </aside>

            <div
                className="min-h-dvh transition-[padding-left] duration-300 ease-in-out"
                style={{ paddingLeft: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED }}
            >
                <div className="platform-mesh-bg relative flex min-h-dvh flex-col">
                    <PlatformHeader />
                    <main className="relative flex-1">{children}</main>
                </div>
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
                <PlatformShellInner sessionEmail={sessionEmail} platformRole={platformRole}>
                    {children}
                </PlatformShellInner>
            </PlatformBreadcrumbProvider>
        </PlatformSidebarProvider>
    );
}

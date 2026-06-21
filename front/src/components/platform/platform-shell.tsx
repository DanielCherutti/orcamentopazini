"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CreditCard, LayoutDashboard, LogOut, Shield, Users } from "lucide-react";
import { logoutAction } from "@/actions/auth-actions";
import { cn } from "@/lib/utils";
import { initialsFromEmail } from "@/components/platform/platform-utils";
import { usePlatformPermissions } from "@/components/platform/platform-permissions-context";
import { PLATFORM_ROLE_LABELS, type PlatformRole } from "@/types/platform-types";

function NavLink({
    href,
    icon: Icon,
    children,
    active,
}: {
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    children: React.ReactNode;
    active: boolean;
}) {
    return (
        <Link
            href={href}
            className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150",
                active
                    ? "bg-white/10 font-medium text-white shadow-sm ring-1 ring-white/10"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
            )}
        >
            <Icon
                className={cn(
                    "h-[18px] w-[18px] shrink-0",
                    active ? "text-violet-300" : "text-slate-500 group-hover:text-slate-300",
                )}
            />
            <span className="truncate">{children}</span>
        </Link>
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
    const { can } = usePlatformPermissions();
    const pathname = usePathname() ?? "";
    const isDashboard =
        pathname === "/platform" || pathname === "/platform/";
    const isOrgs =
        pathname === "/platform/organizations" ||
        pathname.startsWith("/platform/organizations/");
    const isLicenses =
        pathname === "/platform/licenses" || pathname.startsWith("/platform/licenses/");
    const isTeam =
        pathname === "/platform/team" ||
        pathname.startsWith("/platform/team/") ||
        pathname === "/platform/admins";

    return (
        <div className="min-h-dvh bg-slate-50 dark:bg-background">
            <aside
                className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-slate-800/80 bg-slate-950 text-slate-100 shadow-[4px_0_32px_-8px_rgba(0,0,0,0.45)]"
                aria-label="Admin da plataforma"
            >
                <div className="border-b border-slate-800/80 bg-gradient-to-br from-slate-900 via-slate-950 to-violet-950/40 px-5 py-6">
                    <div
                        className="mb-3 h-1 w-10 rounded-full bg-violet-400 shadow-[0_0_16px_rgba(167,139,250,0.55)]"
                        aria-hidden
                    />
                    <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/20 ring-1 ring-violet-400/30">
                            <Shield className="h-4 w-4 text-violet-300" />
                        </div>
                        <div>
                            <p className="text-sm font-bold tracking-tight text-white">PAZINI</p>
                            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
                                Plataforma SaaS
                            </p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
                    <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                        Revenda
                    </p>
                    <NavLink href="/platform" icon={LayoutDashboard} active={isDashboard}>
                        Dashboard
                    </NavLink>
                    <NavLink href="/platform/organizations" icon={Building2} active={isOrgs}>
                        Organizações
                    </NavLink>
                    <NavLink href="/platform/licenses" icon={CreditCard} active={isLicenses}>
                        Planos e preços
                    </NavLink>
                    {can("team.manage") && (
                        <NavLink href="/platform/team" icon={Users} active={isTeam}>
                            Equipe
                        </NavLink>
                    )}
                </nav>

                <div className="border-t border-slate-800/80 bg-slate-900/50 p-3">
                    <div className="mb-3 flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/80 p-2.5">
                        <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-[11px] font-bold text-white"
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
                    <form action={logoutAction}>
                        <button
                            type="submit"
                            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-white"
                        >
                            <LogOut className="h-4 w-4" />
                            Sair
                        </button>
                    </form>
                </div>
            </aside>

            <div className="pl-64">
                <div className="relative min-h-dvh">
                    <div
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_40%_at_50%_-10%,rgba(139,92,246,0.07),transparent)]"
                        aria-hidden
                    />
                    <div className="relative">{children}</div>
                </div>
            </div>
        </div>
    );
}

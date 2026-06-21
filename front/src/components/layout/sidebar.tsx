"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
    LogOut,
    ChevronDown,
    ChevronRight,
    LayoutDashboard,
    Package,
    Boxes,
    FileSpreadsheet,
    Users,
    Settings,
    UserCog,
} from "lucide-react";
import { useSidebar } from "./sidebar-context";
import { logoutAction } from "@/actions/auth-actions";
import { cn } from "@/lib/utils";

function initialsFromEmail(email: string | null | undefined): string {
    if (!email) return "?";
    const local = email.split("@")[0] ?? email;
    const parts = local.split(/[.\s_-]+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    }
    return local.slice(0, 2).toUpperCase();
}

function SectionLabel({ children, collapsed }: { children: ReactNode; collapsed: boolean }) {
    if (collapsed) return null;
    return (
        <p className="px-3 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 first:pt-0">
            {children}
        </p>
    );
}

function NavItem({
    href,
    icon: Icon,
    children,
    active,
    nested,
    collapsed,
}: {
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    children: React.ReactNode;
    active: boolean;
    nested?: boolean;
    collapsed?: boolean;
}) {
    if (collapsed) {
        return (
            <Link
                href={href}
                title={String(children)}
                className={cn(
                    "group relative flex items-center justify-center rounded-xl py-3 text-sm transition-all duration-200",
                    active
                        ? "tenant-nav-active text-white"
                        : "text-slate-300 hover:bg-white/[0.1] hover:text-white",
                )}
            >
                <Icon
                    className={cn(
                        "h-[1.125rem] w-[1.125rem] shrink-0",
                        active ? "text-white" : "text-slate-400 group-hover:text-[color:var(--brand-secondary)]",
                    )}
                />
            </Link>
        );
    }

    return (
        <Link
            href={href}
            className={cn(
                "group flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200",
                nested ? "ml-2 border-l-2 py-2 pl-3 pr-2" : "px-3 py-2.5",
                nested && !active && "border-transparent text-slate-300 hover:text-white",
                nested &&
                    active &&
                    "border-[color:var(--brand-secondary)] bg-white/[0.08] font-medium text-white",
                !nested &&
                    (active
                        ? "relative tenant-nav-active text-white"
                        : "text-slate-300 hover:bg-white/[0.1] hover:text-white"),
            )}
        >
            <Icon
                className={cn(
                    "shrink-0 transition-colors",
                    nested ? "h-3.5 w-3.5" : "h-[1.125rem] w-[1.125rem]",
                    active
                        ? "text-white"
                        : nested
                          ? "text-slate-400"
                          : "text-slate-400 group-hover:text-[color:var(--brand-secondary)]",
                )}
            />
            <span className="truncate">{children}</span>
            {active && !nested ? (
                <span className="absolute right-2 h-1.5 w-1.5 rounded-full bg-white/90" aria-hidden />
            ) : null}
        </Link>
    );
}

export function Sidebar({
    sessionEmail,
    companyName,
    companySubtitle,
}: {
    sessionEmail: string | null;
    companyName: string;
    companySubtitle?: string;
}) {
    const { collapsed } = useSidebar();
    const pathname = usePathname() ?? "";
    const [productsOpen, setProductsOpen] = useState(false);

    useEffect(() => {
        if (pathname.startsWith("/dashboard/products")) {
            setProductsOpen(true);
        }
    }, [pathname]);

    const isProducts = pathname.startsWith("/dashboard/products");
    const isGroups = pathname.startsWith("/dashboard/products/groups");
    const isProductCatalog =
        pathname.startsWith("/dashboard/products") &&
        !pathname.startsWith("/dashboard/products/groups");

    return (
        <aside
            className={cn(
                "tenant-sidebar-surface fixed left-0 z-30 flex flex-col bg-[#0c0e14] text-slate-100 transition-[width] duration-300 ease-in-out top-[var(--support-banner-height,0px)] h-[calc(100dvh-var(--support-banner-height,0px))]",
                collapsed ? "w-[4.75rem]" : "w-64",
            )}
            aria-label="Menu principal"
        >
            <div
                className={cn(
                    "shrink-0 border-b border-white/[0.06] px-4 py-5",
                    collapsed ? "flex justify-center px-3" : "px-5",
                )}
            >
                <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
                    <div
                        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-lg"
                        style={{
                            background: `linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 70%, var(--brand-secondary)) 100%)`,
                            boxShadow: "0 8px 24px -8px rgb(var(--primary-rgb) / 0.5)",
                        }}
                    >
                        <span className="text-sm font-bold text-white">
                            {companyName.slice(0, 1).toUpperCase()}
                        </span>
                        <span
                            className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full ring-2 ring-[#0e1016]"
                            style={{ backgroundColor: "var(--brand-secondary)" }}
                            aria-hidden
                        />
                    </div>
                    {!collapsed ? (
                        <div className="min-w-0">
                            <h2 className="truncate text-base font-bold tracking-tight text-white">
                                {companyName}
                            </h2>
                            {companySubtitle ? (
                                <p className="truncate text-[11px] font-medium text-slate-400">{companySubtitle}</p>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </div>

            <nav className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-3 py-4 [scrollbar-gutter:stable]">
                <SectionLabel collapsed={collapsed}>Navegação</SectionLabel>
                <div className="space-y-1">
                    <NavItem
                        href="/dashboard"
                        icon={LayoutDashboard}
                        active={pathname === "/dashboard"}
                        collapsed={collapsed}
                    >
                        Início
                    </NavItem>
                </div>

                <SectionLabel collapsed={collapsed}>Catálogo</SectionLabel>
                <div className="space-y-1">
                    {collapsed ? (
                        <>
                            <NavItem
                                href="/dashboard/products"
                                icon={Package}
                                active={isProductCatalog}
                                collapsed
                            >
                                Produtos
                            </NavItem>
                            <NavItem
                                href="/dashboard/products/groups"
                                icon={Boxes}
                                active={isGroups}
                                collapsed
                            >
                                Grupos
                            </NavItem>
                        </>
                    ) : (
                        <div>
                            <button
                                type="button"
                                onClick={() => setProductsOpen((v) => !v)}
                                className={cn(
                                    "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
                                    isProducts
                                        ? "tenant-nav-active text-white"
                                        : "text-slate-300 hover:bg-white/[0.1] hover:text-white",
                                )}
                                aria-expanded={productsOpen}
                            >
                                <span className="flex min-w-0 items-center gap-3">
                                    <Package
                                        className={cn(
                                            "h-[1.125rem] w-[1.125rem] shrink-0",
                                            isProducts ? "text-white" : "text-slate-400",
                                        )}
                                    />
                                    <span className="truncate">Produtos</span>
                                </span>
                                {productsOpen ? (
                                    <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                                ) : (
                                    <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                                )}
                            </button>
                            {productsOpen ? (
                                <div className="relative mt-1 space-y-0.5 pb-1">
                                    <NavItem
                                        href="/dashboard/products"
                                        icon={Package}
                                        active={isProductCatalog}
                                        nested
                                    >
                                        Cadastro de produtos
                                    </NavItem>
                                    <NavItem
                                        href="/dashboard/products/groups"
                                        icon={Boxes}
                                        active={isGroups}
                                        nested
                                    >
                                        Grupos de produtos
                                    </NavItem>
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>

                <SectionLabel collapsed={collapsed}>Operação</SectionLabel>
                <div className="space-y-1">
                    <NavItem
                        href="/budgets"
                        icon={FileSpreadsheet}
                        active={pathname.startsWith("/budgets")}
                        collapsed={collapsed}
                    >
                        Orçamentos
                    </NavItem>
                    <NavItem
                        href="/customers"
                        icon={Users}
                        active={pathname.startsWith("/customers")}
                        collapsed={collapsed}
                    >
                        Clientes
                    </NavItem>
                </div>

                <SectionLabel collapsed={collapsed}>Sistema</SectionLabel>
                <div className="space-y-1">
                    <NavItem
                        href="/settings"
                        icon={Settings}
                        active={pathname === "/settings"}
                        collapsed={collapsed}
                    >
                        Configurações
                    </NavItem>
                    <NavItem
                        href="/settings/users"
                        icon={UserCog}
                        active={pathname.startsWith("/settings/users")}
                        collapsed={collapsed}
                    >
                        Usuários
                    </NavItem>
                </div>
            </nav>

            <div className="shrink-0 border-t border-white/[0.06] p-3">
                {!collapsed ? (
                    <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] p-3">
                        <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white"
                            style={{
                                background: `linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 70%, var(--brand-secondary)) 100%)`,
                            }}
                            aria-hidden
                        >
                            {initialsFromEmail(sessionEmail)}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-slate-200">
                                {sessionEmail?.split("@")[0] ?? "Usuário"}
                            </p>
                            <p
                                className="truncate text-[10px] text-slate-500"
                                title={sessionEmail ?? undefined}
                            >
                                {sessionEmail ?? "—"}
                            </p>
                        </div>
                        <form action={logoutAction} className="shrink-0">
                            <button
                                type="submit"
                                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-red-300"
                                aria-label="Sair"
                                title="Sair"
                            >
                                <LogOut className="h-4 w-4" />
                            </button>
                        </form>
                    </div>
                ) : (
                    <form action={logoutAction} className="flex justify-center">
                        <button
                            type="submit"
                            title="Sair"
                            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                        >
                            <LogOut className="h-4 w-4" />
                        </button>
                    </form>
                )}
            </div>
        </aside>
    );
}

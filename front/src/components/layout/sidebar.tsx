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

function SectionLabel({ children }: { children: ReactNode }) {
    return (
        <p className="px-3 pb-1.5 pt-4 first:pt-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/40">
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
}: {
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    children: React.ReactNode;
    active: boolean;
    nested?: boolean;
}) {
    return (
        <Link
            href={href}
            className={cn(
                "group flex items-center gap-3 rounded-lg text-sm transition-all duration-150",
                nested ? "py-1.5 pl-3 pr-2 ml-2 border-l-2" : "px-3 py-2",
                nested && !active && "border-transparent text-sidebar-foreground/65 hover:text-sidebar-foreground",
                nested && active && "border-[#FBB03B] bg-sidebar-accent/60 text-sidebar-foreground font-medium",
                !nested &&
                    (active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm ring-1 ring-white/10"
                        : "text-sidebar-foreground/75 hover:bg-sidebar-accent/55 hover:text-sidebar-accent-foreground")
            )}
        >
            <Icon
                className={cn(
                    "shrink-0 transition-colors",
                    nested ? "h-3.5 w-3.5" : "h-[18px] w-[18px]",
                    active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80"
                )}
            />
            <span className="truncate">{children}</span>
        </Link>
    );
}

export function Sidebar({
    sessionEmail,
}: {
    sessionEmail: string | null;
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
        pathname.startsWith("/dashboard/products") && !pathname.startsWith("/dashboard/products/groups");

    return (
        <aside
            className={cn(
                "fixed left-0 top-0 z-20 flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[4px_0_24px_-8px_rgba(0,0,0,0.25)] transition-all duration-300 ease-in-out",
                collapsed ? "w-0 overflow-hidden opacity-0 pointer-events-none" : "w-64 opacity-100"
            )}
            aria-label="Menu principal"
        >
            {/* Marca */}
            <div className="shrink-0 border-b border-sidebar-border bg-gradient-to-br from-sidebar-accent/40 via-sidebar to-sidebar px-4 py-5">
                <div className="mb-2 h-1 w-10 rounded-full bg-[#FBB03B] shadow-[0_0_12px_rgba(251,176,59,0.45)]" />
                <h2 className="text-lg font-bold tracking-tight text-white">PAZINI</h2>
                <p className="text-[11px] font-medium text-sidebar-foreground/55">Engenharia</p>
            </div>

            <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-2 pb-3 [scrollbar-gutter:stable]">
                <SectionLabel>Navegação</SectionLabel>
                <div className="space-y-0.5">
                    <NavItem
                        href="/dashboard"
                        icon={LayoutDashboard}
                        active={pathname === "/dashboard"}
                    >
                        Início
                    </NavItem>
                </div>

                <SectionLabel>Catálogo</SectionLabel>
                <div className="space-y-0.5">
                    <div>
                        <button
                            type="button"
                            onClick={() => setProductsOpen((v) => !v)}
                            className={cn(
                                "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                                isProducts
                                    ? "bg-sidebar-accent/70 text-white ring-1 ring-white/10"
                                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-white"
                            )}
                            aria-expanded={productsOpen}
                        >
                            <span className="flex items-center gap-3 min-w-0">
                                <Package
                                    className={cn(
                                        "h-[18px] w-[18px] shrink-0",
                                        isProducts ? "text-[#FBB03B]" : "text-sidebar-foreground/50"
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
                        {productsOpen && (
                            <div className="mt-1 space-y-0.5 pb-1">
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
                        )}
                    </div>
                </div>

                <SectionLabel>Operação</SectionLabel>
                <div className="space-y-0.5">
                    <NavItem
                        href="/budgets"
                        icon={FileSpreadsheet}
                        active={pathname.startsWith("/budgets")}
                    >
                        Orçamentos
                    </NavItem>
                    <NavItem href="/customers" icon={Users} active={pathname.startsWith("/customers")}>
                        Clientes
                    </NavItem>
                </div>

                <SectionLabel>Sistema</SectionLabel>
                <div className="space-y-0.5">
                    <NavItem
                        href="/settings"
                        icon={Settings}
                        active={pathname === "/settings"}
                    >
                        Configurações
                    </NavItem>
                    <NavItem
                        href="/settings/users"
                        icon={UserCog}
                        active={pathname.startsWith("/settings/users")}
                    >
                        Usuários
                    </NavItem>
                </div>
            </nav>

            {/* Usuário */}
            <div className="shrink-0 border-t border-sidebar-border bg-sidebar-accent/25 p-3">
                <div className="flex items-center gap-3 rounded-lg border border-sidebar-border/60 bg-sidebar/80 p-2.5 shadow-sm">
                    <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/90 to-primary text-[11px] font-bold text-primary-foreground shadow-inner ring-2 ring-[#FBB03B]/30"
                        aria-hidden
                    >
                        {initialsFromEmail(sessionEmail)}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">
                            {sessionEmail?.split("@")[0] ?? "Usuário"}
                        </p>
                        <p className="truncate text-[11px] text-sidebar-foreground/50" title={sessionEmail ?? undefined}>
                            {sessionEmail ?? "—"}
                        </p>
                    </div>
                    <form action={logoutAction} className="shrink-0">
                        <button
                            type="submit"
                            className="rounded-md p-2 text-sidebar-foreground/55 transition-colors hover:bg-destructive/20 hover:text-red-200"
                            aria-label="Sair"
                            title="Sair"
                        >
                            <LogOut className="h-4 w-4" />
                        </button>
                    </form>
                </div>
            </div>
        </aside>
    );
}

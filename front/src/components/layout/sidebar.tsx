"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    BookOpen,
    Boxes,
    FileSpreadsheet,
    FileText,
    HardHat,
    LayoutDashboard,
    LogOut,
    Package,
    Settings,
    UserCog,
    Users,
    Wrench,
} from "lucide-react";
import { logoutAction } from "@/actions/auth-actions";
import { useSidebar } from "./sidebar-context";
import { cn } from "@/lib/utils";

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
                    "tenant-ops-rail-link group relative flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-200",
                    active
                        ? "bg-[rgb(var(--primary-rgb)/0.25)] text-white shadow-[0_0_28px_-4px_rgb(var(--primary-rgb)/0.9)] ring-1 ring-[rgb(var(--primary-rgb)/0.5)]"
                        : "text-white/45 hover:bg-white/[0.06] hover:text-white/90",
                )}
            >
                {active ? (
                    <span
                        className="absolute -left-3 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-[var(--brand-secondary)] shadow-[0_0_12px_rgb(var(--brand-secondary-rgb)/0.9)]"
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
                "tenant-ops-nav-link relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200",
                active
                    ? "bg-[rgb(var(--primary-rgb)/0.25)] text-white shadow-[0_0_28px_-4px_rgb(var(--primary-rgb)/0.5)] ring-1 ring-[rgb(var(--primary-rgb)/0.4)]"
                    : "text-white/70 hover:bg-white/[0.06] hover:text-white",
            )}
        >
            {active ? (
                <span
                    className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-[var(--brand-secondary)] shadow-[0_0_12px_rgb(var(--brand-secondary-rgb)/0.9)]"
                    aria-hidden
                />
            ) : null}
            <Icon className="h-5 w-5 shrink-0" />
            <span className="truncate">{label}</span>
        </Link>
    );
}

export function Sidebar({
    companyName,
    companySubtitle,
}: {
    sessionEmail?: string | null;
    companyName: string;
    companySubtitle?: string;
}) {
    const { collapsed } = useSidebar();
    const pathname = usePathname() ?? "";

    const isDashboard = pathname === "/dashboard";
    const isProductCatalog =
        pathname.startsWith("/dashboard/products") &&
        !pathname.startsWith("/dashboard/products/groups");
    const isGroups = pathname.startsWith("/dashboard/products/groups");
    const isTechnicalEquipment = pathname.startsWith("/dashboard/technical-equipment");
    const isDatabooks = pathname.startsWith("/dashboard/databooks");
    const isDeliveryProjects = pathname.startsWith("/delivery-projects");
    const isBudgets = pathname.startsWith("/budgets");
    const isCustomers = pathname.startsWith("/customers");
    const isModelos = pathname.startsWith("/modelos");
    const isSettings = pathname === "/settings";
    const isUsers = pathname.startsWith("/settings/users");

    const nav = [
        { href: "/dashboard", icon: LayoutDashboard, label: "Início", active: isDashboard },
        { href: "/dashboard/products", icon: Package, label: "Produtos", active: isProductCatalog },
        { href: "/dashboard/products/groups", icon: Boxes, label: "Grupos", active: isGroups },
        {
            href: "/dashboard/technical-equipment",
            icon: Wrench,
            label: "Equip. técnicos",
            active: isTechnicalEquipment,
        },
        {
            href: "/dashboard/databooks",
            icon: BookOpen,
            label: "DataBooks",
            active: isDatabooks,
        },
        { href: "/budgets", icon: FileSpreadsheet, label: "Orçamentos", active: isBudgets },
        {
            href: "/delivery-projects",
            icon: HardHat,
            label: "Entrega técnica",
            active: isDeliveryProjects,
        },
        { href: "/customers", icon: Users, label: "Clientes", active: isCustomers },
        { href: "/modelos", icon: FileText, label: "Modelos", active: isModelos },
        { href: "/settings", icon: Settings, label: "Configurações", active: isSettings },
        { href: "/settings/users", icon: UserCog, label: "Usuários", active: isUsers },
    ] as const;

    const initial = companyName.slice(0, 1).toUpperCase();

    return (
        <aside
            className={cn(
                "tenant-ops-rail fixed inset-y-0 left-0 z-30 flex flex-col border-r border-[rgb(var(--primary-rgb)/0.15)] py-4 transition-[width] duration-300 ease-in-out top-[var(--support-banner-height,0px)] h-[calc(100dvh-var(--support-banner-height,0px))]",
                collapsed ? "w-20 items-center" : "w-64 items-stretch px-3",
            )}
            aria-label="Menu principal"
        >
            {collapsed ? (
                <Link
                    href="/dashboard"
                    className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-black text-white shadow-[0_0_32px_-4px_rgb(var(--primary-rgb)/0.85)] ring-1 ring-[rgb(var(--primary-rgb)/0.3)]"
                    style={{
                        background: `linear-gradient(135deg, var(--primary) 0%, var(--brand-secondary) 100%)`,
                    }}
                    title={companyName}
                >
                    {initial}
                </Link>
            ) : (
                <Link
                    href="/dashboard"
                    className="mb-6 flex items-center gap-3 rounded-2xl border border-[rgb(var(--primary-rgb)/0.2)] bg-[rgb(var(--primary-rgb)/0.1)] px-3 py-3 transition-colors hover:border-[rgb(var(--primary-rgb)/0.4)] hover:bg-[rgb(var(--primary-rgb)/0.15)]"
                >
                    <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white shadow-[0_0_24px_-4px_rgb(var(--primary-rgb)/0.85)] ring-1 ring-[rgb(var(--primary-rgb)/0.3)]"
                        style={{
                            background: `linear-gradient(135deg, var(--primary) 0%, var(--brand-secondary) 100%)`,
                        }}
                    >
                        {initial}
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
                            Operação
                        </p>
                        <p className="truncate text-xs font-semibold text-white">{companyName}</p>
                        {companySubtitle ? (
                            <p className="truncate text-[10px] text-white/45">{companySubtitle}</p>
                        ) : null}
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
                        "flex items-center justify-center rounded-xl border border-white/10 text-white/50 transition-colors hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300",
                        collapsed ? "h-11 w-11" : "w-full gap-3 px-3 py-2.5 text-sm font-medium",
                    )}
                >
                    <LogOut className="h-4 w-4 shrink-0" />
                    {!collapsed ? <span>Sair</span> : null}
                </button>
            </form>
        </aside>
    );
}

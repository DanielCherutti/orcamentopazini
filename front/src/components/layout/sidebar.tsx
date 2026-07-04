"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
    BookOpen,
    Boxes,
    ChevronDown,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSidebar } from "./sidebar-context";
import { cn } from "@/lib/utils";

type NavIcon = React.ComponentType<{ className?: string }>;

type NavLeaf = {
    href: string;
    icon: NavIcon;
    label: string;
    active: boolean;
};

type NavGroupDef = {
    id: string;
    label: string;
    icon: NavIcon;
    items: NavLeaf[];
};

function activeBar(collapsed: boolean) {
    return collapsed
        ? "absolute -left-3 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-[var(--brand-secondary)] shadow-[0_0_12px_rgb(var(--brand-secondary-rgb)/0.9)]"
        : "absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-[var(--brand-secondary)] shadow-[0_0_12px_rgb(var(--brand-secondary-rgb)/0.9)]";
}

function NavItem({
    href,
    icon: Icon,
    label,
    active,
    collapsed,
    subItem = false,
}: NavLeaf & { collapsed: boolean; subItem?: boolean }) {
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
                {active ? <span className={activeBar(true)} aria-hidden /> : null}
                <Icon className="h-5 w-5" />
            </Link>
        );
    }

    return (
        <Link
            href={href}
            className={cn(
                "tenant-ops-nav-link relative flex items-center gap-3 rounded-xl py-2.5 text-sm font-semibold transition-all duration-200",
                subItem ? "pl-9 pr-3" : "px-3",
                active
                    ? "bg-[rgb(var(--primary-rgb)/0.25)] text-white shadow-[0_0_28px_-4px_rgb(var(--primary-rgb)/0.5)] ring-1 ring-[rgb(var(--primary-rgb)/0.4)]"
                    : "text-white/70 hover:bg-white/[0.06] hover:text-white",
            )}
        >
            {active ? <span className={activeBar(false)} aria-hidden /> : null}
            {!subItem ? <Icon className="h-5 w-5 shrink-0" /> : null}
            <span className="truncate">{label}</span>
        </Link>
    );
}

function NavGroup({
    group,
    collapsed,
}: {
    group: NavGroupDef;
    collapsed: boolean;
}) {
    const groupActive = group.items.some((item) => item.active);
    const [open, setOpen] = useState(groupActive);

    useEffect(() => {
        if (groupActive) setOpen(true);
    }, [groupActive]);

    const Icon = group.icon;

    if (collapsed) {
        return (
            <Popover>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        title={group.label}
                        className={cn(
                            "tenant-ops-rail-link relative flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-200",
                            groupActive
                                ? "bg-[rgb(var(--primary-rgb)/0.25)] text-white shadow-[0_0_28px_-4px_rgb(var(--primary-rgb)/0.9)] ring-1 ring-[rgb(var(--primary-rgb)/0.5)]"
                                : "text-white/45 hover:bg-white/[0.06] hover:text-white/90",
                        )}
                    >
                        {groupActive ? <span className={activeBar(true)} aria-hidden /> : null}
                        <Icon className="h-5 w-5" />
                    </button>
                </PopoverTrigger>
                <PopoverContent
                    side="right"
                    align="start"
                    sideOffset={12}
                    className="w-52 border-white/10 bg-[#12101a] p-2 text-white"
                >
                    <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
                        {group.label}
                    </p>
                    <div className="flex flex-col gap-0.5">
                        {group.items.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium transition-colors",
                                    item.active
                                        ? "bg-[rgb(var(--primary-rgb)/0.3)] text-white"
                                        : "text-white/75 hover:bg-white/[0.06] hover:text-white",
                                )}
                            >
                                <item.icon className="h-4 w-4 shrink-0 opacity-80" />
                                {item.label}
                            </Link>
                        ))}
                    </div>
                </PopoverContent>
            </Popover>
        );
    }

    return (
        <div className="flex flex-col gap-0.5">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200",
                    groupActive
                        ? "bg-[rgb(var(--primary-rgb)/0.12)] text-white"
                        : "text-white/70 hover:bg-white/[0.06] hover:text-white",
                )}
            >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="flex-1 truncate text-left">{group.label}</span>
                <ChevronDown
                    className={cn(
                        "h-4 w-4 shrink-0 text-white/45 transition-transform duration-200",
                        open && "rotate-180",
                    )}
                />
            </button>
            {open ? (
                <div className="flex flex-col gap-0.5 pb-1">
                    {group.items.map((item) => (
                        <NavItem key={item.href} {...item} collapsed={false} subItem />
                    ))}
                </div>
            ) : null}
        </div>
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

    const home: NavLeaf = {
        href: "/dashboard",
        icon: LayoutDashboard,
        label: "Início",
        active: isDashboard,
    };

    const groups: NavGroupDef[] = useMemo(
        () => [
            {
                id: "catalog",
                label: "Catálogo",
                icon: Package,
                items: [
                    {
                        href: "/dashboard/products",
                        icon: Package,
                        label: "Produtos",
                        active: isProductCatalog,
                    },
                    {
                        href: "/dashboard/products/groups",
                        icon: Boxes,
                        label: "Grupos",
                        active: isGroups,
                    },
                ],
            },
            {
                id: "commercial",
                label: "Comercial",
                icon: FileSpreadsheet,
                items: [
                    {
                        href: "/budgets",
                        icon: FileSpreadsheet,
                        label: "Orçamentos",
                        active: isBudgets,
                    },
                    {
                        href: "/customers",
                        icon: Users,
                        label: "Clientes",
                        active: isCustomers,
                    },
                    {
                        href: "/modelos",
                        icon: FileText,
                        label: "Modelos",
                        active: isModelos,
                    },
                ],
            },
            {
                id: "delivery",
                label: "Entrega técnica",
                icon: HardHat,
                items: [
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
                    {
                        href: "/delivery-projects",
                        icon: HardHat,
                        label: "Projetos",
                        active: isDeliveryProjects,
                    },
                ],
            },
            {
                id: "admin",
                label: "Administração",
                icon: Settings,
                items: [
                    {
                        href: "/settings",
                        icon: Settings,
                        label: "Configurações",
                        active: isSettings,
                    },
                    {
                        href: "/settings/users",
                        icon: UserCog,
                        label: "Usuários",
                        active: isUsers,
                    },
                ],
            },
        ],
        [
            isProductCatalog,
            isGroups,
            isBudgets,
            isCustomers,
            isModelos,
            isTechnicalEquipment,
            isDatabooks,
            isDeliveryProjects,
            isSettings,
            isUsers,
        ],
    );

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
                <NavItem {...home} collapsed={collapsed} />
                {groups.map((group) => (
                    <NavGroup key={group.id} group={group} collapsed={collapsed} />
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

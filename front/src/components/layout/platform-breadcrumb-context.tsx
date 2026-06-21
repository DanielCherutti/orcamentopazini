"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
    label: string;
    href?: string;
};

const PlatformBreadcrumbContext = createContext<{
    items: BreadcrumbItem[] | null;
    setItems: (items: BreadcrumbItem[] | null) => void;
} | null>(null);

export function PlatformBreadcrumbProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<BreadcrumbItem[] | null>(null);
    return (
        <PlatformBreadcrumbContext.Provider value={{ items, setItems }}>
            {children}
        </PlatformBreadcrumbContext.Provider>
    );
}

/** Define trilha customizada (ex.: nome da org no detalhe). Limpa ao desmontar. */
export function SetPlatformBreadcrumbs({ items }: { items: BreadcrumbItem[] }) {
    const ctx = useContext(PlatformBreadcrumbContext);
    const serialized = JSON.stringify(items);
    useEffect(() => {
        if (!ctx) return;
        ctx.setItems(items);
        return () => ctx.setItems(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- serializado para estabilidade
    }, [ctx, serialized]);
    return null;
}

function breadcrumbsFromPathname(pathname: string): BreadcrumbItem[] {
    if (pathname === "/platform" || pathname === "/platform/") {
        return [{ label: "Dashboard" }];
    }
    if (pathname === "/platform/organizations") {
        return [
            { href: "/platform", label: "Dashboard" },
            { label: "Organizações" },
        ];
    }
    if (pathname.startsWith("/platform/organizations/")) {
        return [
            { href: "/platform", label: "Dashboard" },
            { href: "/platform/organizations", label: "Organizações" },
            { label: "Detalhe" },
        ];
    }
    if (pathname.startsWith("/platform/licenses")) {
        return [
            { href: "/platform", label: "Dashboard" },
            { label: "Planos e preços" },
        ];
    }
    if (pathname.startsWith("/platform/audit")) {
        return [
            { href: "/platform", label: "Dashboard" },
            { label: "Auditoria" },
        ];
    }
    if (pathname.startsWith("/platform/team") || pathname.startsWith("/platform/admins")) {
        return [
            { href: "/platform", label: "Dashboard" },
            { label: "Equipe" },
        ];
    }
    return [{ href: "/platform", label: "Dashboard" }];
}

export function PlatformBreadcrumbs({ className }: { className?: string }) {
    const pathname = usePathname() ?? "";
    const ctx = useContext(PlatformBreadcrumbContext);
    const items = ctx?.items ?? breadcrumbsFromPathname(pathname);

    if (items.length === 0) return null;

    return (
        <nav aria-label="Breadcrumb" className={cn("flex min-w-0 items-center gap-1 text-sm", className)}>
            <ol className="flex min-w-0 flex-wrap items-center gap-1">
                {items.map((item, index) => {
                    const isLast = index === items.length - 1;
                    return (
                        <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
                            {index > 0 ? (
                                <ChevronRight
                                    className="size-3.5 shrink-0 text-muted-foreground/60"
                                    aria-hidden
                                />
                            ) : null}
                            {item.href && !isLast ? (
                                <Link
                                    href={item.href}
                                    className="truncate text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    {item.label}
                                </Link>
                            ) : (
                                <span
                                    className={cn(
                                        "truncate",
                                        isLast ? "font-medium text-foreground" : "text-muted-foreground",
                                    )}
                                    aria-current={isLast ? "page" : undefined}
                                >
                                    {item.label}
                                </span>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}

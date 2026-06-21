"use client";

import { PanelLeft, PanelLeftClose } from "lucide-react";
import { PlatformBreadcrumbs } from "@/components/layout/platform-breadcrumb-context";
import { usePlatformSidebar } from "@/components/layout/platform-sidebar-context";
import { PlatformOrgAccessButton } from "@/components/platform/platform-org-access-button";
import { PRODUCT_NAME } from "@/lib/product-brand";
import { cn } from "@/lib/utils";

export function PlatformHeader() {
    const { collapsed, toggleSidebar } = usePlatformSidebar();

    return (
        <header
            className={cn(
                "sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4",
                "border-b border-border/80 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6",
            )}
        >
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                    type="button"
                    onClick={toggleSidebar}
                    className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={collapsed ? "Abrir menu lateral" : "Fechar menu lateral"}
                >
                    {collapsed ? (
                        <PanelLeft className="h-5 w-5" />
                    ) : (
                        <PanelLeftClose className="h-5 w-5" />
                    )}
                </button>
                <div className="hidden min-w-0 sm:block">
                    <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                        {PRODUCT_NAME}
                    </p>
                    <PlatformBreadcrumbs />
                </div>
                <div className="min-w-0 sm:hidden">
                    <PlatformBreadcrumbs />
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <PlatformOrgAccessButton variant="header" />
            </div>
        </header>
    );
}

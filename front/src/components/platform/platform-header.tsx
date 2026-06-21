"use client";

import { PanelLeft, PanelLeftClose } from "lucide-react";
import { PlatformBreadcrumbs } from "@/components/layout/platform-breadcrumb-context";
import { usePlatformSidebar } from "@/components/layout/platform-sidebar-context";
import { PlatformOrgAccessButton } from "@/components/platform/platform-org-access-button";
import { cn } from "@/lib/utils";

export function PlatformHeader() {
    const { collapsed, toggleSidebar } = usePlatformSidebar();

    return (
        <header
            className={cn(
                "platform-glass-header sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-4 px-4 sm:px-6",
            )}
        >
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                    type="button"
                    onClick={toggleSidebar}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/[0.06] bg-white/60 text-muted-foreground transition-colors hover:bg-white hover:text-foreground dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                    aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
                >
                    {collapsed ? (
                        <PanelLeft className="h-4 w-4" />
                    ) : (
                        <PanelLeftClose className="h-4 w-4" />
                    )}
                </button>
                <div className="min-w-0">
                    <PlatformBreadcrumbs />
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <PlatformOrgAccessButton variant="header" />
            </div>
        </header>
    );
}

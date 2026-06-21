"use client";

import { PanelLeft, PanelLeftClose } from "lucide-react";
import { BudgetEmailNotificationsBell } from "@/components/layout/budget-email-notifications-bell";
import { PlatformAccessLink } from "@/components/platform/platform-access-link";
import { TenantSwitcher } from "@/components/tenant/tenant-switcher";
import { useSidebar } from "./sidebar-context";

export function Header({ companyName }: { companyName: string }) {
    const { collapsed, toggleSidebar } = useSidebar();

    return (
        <header className="tenant-glass-header sticky top-[var(--support-banner-height,0px)] z-10 flex h-16 w-full shrink-0 items-center justify-between gap-4 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
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
                    <h1 className="truncate text-base font-bold tracking-tight text-foreground sm:text-lg">
                        {companyName}
                    </h1>
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <PlatformAccessLink />
                <TenantSwitcher />
                <BudgetEmailNotificationsBell />
            </div>
        </header>
    );
}

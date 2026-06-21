"use client";

import { PanelLeft, PanelLeftClose } from "lucide-react";
import { BudgetEmailNotificationsBell } from "@/components/layout/budget-email-notifications-bell";
import { PlatformAccessLink } from "@/components/platform/platform-access-link";
import { TenantSwitcher } from "@/components/tenant/tenant-switcher";
import { useSidebar } from "./sidebar-context";

export function Header({ companyName }: { companyName: string }) {
    const { collapsed, toggleSidebar } = useSidebar();

    return (
        <header className="h-16 border-b border-border bg-background px-6 flex items-center justify-between sticky top-[var(--support-banner-height,0px)] z-10 w-full">
            <div className="flex items-center gap-3">
                <button
                    onClick={toggleSidebar}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={collapsed ? "Abrir menu lateral" : "Fechar menu lateral"}
                >
                    {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
                </button>
                <h1 className="text-lg font-semibold text-foreground">{companyName}</h1>
            </div>
            <div className="flex items-center gap-2">
                <PlatformAccessLink />
                <TenantSwitcher />
                <BudgetEmailNotificationsBell />
            </div>
        </header>
    );
}

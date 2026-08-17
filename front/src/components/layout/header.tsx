"use client";

import { PanelLeft, PanelLeftClose } from "lucide-react";
import { BudgetEmailNotificationsBell } from "@/components/layout/budget-email-notifications-bell";
import { PlatformAccessLink } from "@/components/platform/platform-access-link";
import { initialsFromEmail } from "@/components/platform/platform-utils";
import { TenantSwitcher } from "@/components/tenant/tenant-switcher";
import { useSidebar } from "./sidebar-context";

export function Header({
    companyName,
    sessionEmail,
}: {
    companyName: string;
    sessionEmail: string | null;
}) {
    const { collapsed, toggleSidebar } = useSidebar();

    return (
        <header className="tenant-ops-command-bar sticky top-[var(--support-banner-height,0px)] z-20 flex h-14 shrink-0 items-center justify-between gap-4 px-5">
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                    type="button"
                    onClick={toggleSidebar}
                    className="shell-chrome-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors"
                    aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
                    title={collapsed ? "Expandir menu" : "Recolher menu"}
                >
                    {collapsed ? (
                        <PanelLeft className="h-4 w-4" />
                    ) : (
                        <PanelLeftClose className="h-4 w-4" />
                    )}
                </button>
                <span className="hidden shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-[color:rgb(var(--brand-secondary-rgb)/0.85)] xl:inline">
                    Operação
                </span>
                <span className="hidden h-4 w-px bg-[rgb(var(--primary-rgb)/0.3)] xl:block" aria-hidden />
                <p className="tenant-ops-command-title hidden max-w-[11rem] truncate text-xs font-medium text-white/90 2xl:max-w-[14rem] xl:block">
                    {companyName}
                </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                <PlatformAccessLink />
                <TenantSwitcher />
                <BudgetEmailNotificationsBell />
                <div className="hidden items-center gap-2.5 rounded-lg border border-[rgb(var(--primary-rgb)/0.2)] bg-[rgb(var(--primary-rgb)/0.1)] px-3 py-1.5 sm:flex">
                    <div
                        className="flex h-8 w-8 items-center justify-center rounded-md text-[10px] font-bold text-white"
                        style={{
                            background: `linear-gradient(135deg, var(--primary) 0%, var(--brand-secondary) 100%)`,
                        }}
                        aria-hidden
                    >
                        {initialsFromEmail(sessionEmail)}
                    </div>
                    <div className="min-w-0 max-w-[140px]">
                        <p className="truncate text-xs font-semibold text-white/90">
                            {sessionEmail?.split("@")[0] ?? "Usuário"}
                        </p>
                        <p className="truncate text-[10px] text-white/45">{sessionEmail ?? "—"}</p>
                    </div>
                </div>
            </div>
        </header>
    );
}

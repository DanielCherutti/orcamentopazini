"use client";

import { PanelLeft, PanelLeftClose } from "lucide-react";
import { PlatformBreadcrumbs } from "@/components/layout/platform-breadcrumb-context";
import { usePlatformSidebar } from "@/components/layout/platform-sidebar-context";
import { PlatformOrgAccessButton } from "@/components/platform/platform-org-access-button";
import { initialsFromEmail } from "@/components/platform/platform-utils";
import { PLATFORM_ROLE_LABELS, type PlatformRole } from "@/types/platform-types";
import { PRODUCT_NAME } from "@/lib/product-brand";

export function PlatformCommandBar({
    sessionEmail,
    platformRole,
}: {
    sessionEmail: string | null;
    platformRole: PlatformRole;
}) {
    const { collapsed, toggleSidebar } = usePlatformSidebar();

    return (
        <header className="platform-ops-command-bar sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 px-5">
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                    type="button"
                    onClick={toggleSidebar}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 transition-colors hover:border-violet-300 hover:bg-violet-100 hover:text-violet-900"
                    aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
                    title={collapsed ? "Expandir menu" : "Recolher menu"}
                >
                    {collapsed ? (
                        <PanelLeft className="h-4 w-4" />
                    ) : (
                        <PanelLeftClose className="h-4 w-4" />
                    )}
                </button>
                <span className="hidden shrink-0 text-[10px] font-black uppercase tracking-[0.24em] text-violet-400/80 lg:inline">
                    {PRODUCT_NAME}
                </span>
                <span className="hidden h-4 w-px bg-violet-500/30 lg:block" aria-hidden />
                <PlatformBreadcrumbs className="min-w-0 text-sm" />
            </div>
            <div className="flex shrink-0 items-center gap-3">
                <PlatformOrgAccessButton variant="header" />
                <div className="hidden items-center gap-2.5 rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-1.5 sm:flex">
                    <div
                        className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 text-[10px] font-bold text-white"
                        aria-hidden
                    >
                        {initialsFromEmail(sessionEmail)}
                    </div>
                    <div className="min-w-0 max-w-[140px]">
                        <p className="truncate text-xs font-semibold text-slate-800">
                            {sessionEmail?.split("@")[0] ?? "Admin"}
                        </p>
                        <p className="truncate text-[10px] text-slate-600/60">
                            {PLATFORM_ROLE_LABELS[platformRole]}
                        </p>
                    </div>
                </div>
            </div>
        </header>
    );
}

"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { useSidebar } from "./sidebar-context";

const SIDEBAR_COLLAPSED = "5rem";
const SIDEBAR_EXPANDED = "16rem";

export function LayoutShell({
    children,
    sessionEmail,
    companyName,
    companySubtitle,
}: {
    children: React.ReactNode;
    sessionEmail: string | null;
    companyName: string;
    companySubtitle?: string;
}) {
    const { collapsed } = useSidebar();

    return (
        <div className="tenant-app tenant-ops min-h-dvh bg-background">
            <Sidebar companyName={companyName} companySubtitle={companySubtitle} />
            <div
                className="flex min-h-dvh flex-col transition-[padding-left] duration-300 ease-in-out"
                style={{ paddingLeft: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED }}
            >
                <Header companyName={companyName} sessionEmail={sessionEmail} />
                <main className="tenant-ops-main relative flex-1">{children}</main>
            </div>
        </div>
    );
}

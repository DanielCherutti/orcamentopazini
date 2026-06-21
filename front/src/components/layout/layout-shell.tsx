"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { useSidebar } from "./sidebar-context";

const SIDEBAR_EXPANDED = "16rem";
const SIDEBAR_COLLAPSED = "4.75rem";

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
        <div
            className="tenant-app flex min-h-screen flex-1 flex-col"
            style={
                {
                    "--tenant-sidebar-width": collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED,
                } as React.CSSProperties
            }
        >
            <Sidebar
                sessionEmail={sessionEmail}
                companyName={companyName}
                companySubtitle={companySubtitle}
            />
            <div
                className="min-h-screen transition-[padding-left] duration-300 ease-in-out"
                style={{ paddingLeft: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED }}
            >
                <div className="tenant-mesh-bg relative flex min-h-screen flex-col">
                    <Header companyName={companyName} />
                    <main className="relative flex-1">{children}</main>
                </div>
            </div>
        </div>
    );
}

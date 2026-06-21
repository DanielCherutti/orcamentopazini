"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { useSidebar } from "./sidebar-context";

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
        <div className="min-h-screen bg-background flex flex-col flex-1 min-h-0">
            <Sidebar
                sessionEmail={sessionEmail}
                companyName={companyName}
                companySubtitle={companySubtitle}
            />
            <div
                className={`transition-[padding-left] duration-300 ease-in-out ${
                    collapsed ? "pl-0" : "pl-64"
                }`}
            >
                <Header companyName={companyName} />
                <main>
                    {children}
                </main>
            </div>
        </div>
    );
}

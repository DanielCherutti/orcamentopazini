"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { useSidebar } from "./sidebar-context";

export function LayoutShell({ children }: { children: React.ReactNode }) {
    const { collapsed } = useSidebar();

    return (
        <div className="min-h-screen bg-background">
            <Sidebar />
            <div
                className={`transition-[padding-left] duration-300 ease-in-out ${
                    collapsed ? "pl-0" : "pl-64"
                }`}
            >
                <Header />
                <main>
                    {children}
                </main>
            </div>
        </div>
    );
}

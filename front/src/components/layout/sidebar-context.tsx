"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface SidebarContextValue {
    collapsed: boolean;
    toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

const STORAGE_KEY = "sidebar-collapsed";

function getInitialCollapsed(): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "true";
}

export function SidebarProvider({ children }: { children: ReactNode }) {
    const [collapsed, setCollapsed] = useState(getInitialCollapsed);

    const toggleSidebar = useCallback(() => {
        setCollapsed((prev) => {
            const next = !prev;
            localStorage.setItem(STORAGE_KEY, String(next));
            return next;
        });
    }, []);

    return (
        <SidebarContext.Provider value={{ collapsed, toggleSidebar }}>
            {children}
        </SidebarContext.Provider>
    );
}

export function useSidebar() {
    const context = useContext(SidebarContext);
    if (!context) {
        throw new Error("useSidebar must be used within a SidebarProvider");
    }
    return context;
}

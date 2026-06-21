"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface PlatformSidebarContextValue {
    collapsed: boolean;
    toggleSidebar: () => void;
    setCollapsed: (value: boolean) => void;
}

const PlatformSidebarContext = createContext<PlatformSidebarContextValue | null>(null);

const STORAGE_KEY = "platform-sidebar-collapsed";

function getInitialCollapsed(): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "true";
}

export function PlatformSidebarProvider({ children }: { children: ReactNode }) {
    const [collapsed, setCollapsedState] = useState(getInitialCollapsed);

    const setCollapsed = useCallback((value: boolean) => {
        setCollapsedState(value);
        localStorage.setItem(STORAGE_KEY, String(value));
    }, []);

    const toggleSidebar = useCallback(() => {
        setCollapsedState((prev) => {
            const next = !prev;
            localStorage.setItem(STORAGE_KEY, String(next));
            return next;
        });
    }, []);

    return (
        <PlatformSidebarContext.Provider value={{ collapsed, toggleSidebar, setCollapsed }}>
            {children}
        </PlatformSidebarContext.Provider>
    );
}

export function usePlatformSidebar() {
    const context = useContext(PlatformSidebarContext);
    if (!context) {
        throw new Error("usePlatformSidebar must be used within PlatformSidebarProvider");
    }
    return context;
}

"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

interface PlatformSidebarContextValue {
    collapsed: boolean;
    toggleSidebar: () => void;
    setCollapsed: (value: boolean) => void;
}

const PlatformSidebarContext = createContext<PlatformSidebarContextValue | null>(null);

const STORAGE_KEY = "platform-sidebar-collapsed";

const SSR_COLLAPSED_DEFAULT = true;

export function PlatformSidebarProvider({ children }: { children: ReactNode }) {
    const [collapsed, setCollapsedState] = useState(SSR_COLLAPSED_DEFAULT);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored !== null) {
                setCollapsedState(stored === "true");
            }
        } catch {
            /* ignore private mode */
        }
    }, []);

    const setCollapsed = useCallback((value: boolean) => {
        setCollapsedState(value);
        try {
            localStorage.setItem(STORAGE_KEY, String(value));
        } catch {
            /* ignore */
        }
    }, []);

    const toggleSidebar = useCallback(() => {
        setCollapsedState((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(STORAGE_KEY, String(next));
            } catch {
                /* ignore */
            }
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

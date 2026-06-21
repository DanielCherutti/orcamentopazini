"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

interface SidebarContextValue {
    collapsed: boolean;
    toggleSidebar: () => void;
    setCollapsed: (value: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

const STORAGE_KEY = "sidebar-collapsed";

/** Default recolhido — igual no SSR e na 1ª renderização do cliente (evita hydration mismatch). */
const SSR_COLLAPSED_DEFAULT = true;

export function SidebarProvider({ children }: { children: ReactNode }) {
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
        <SidebarContext.Provider value={{ collapsed, toggleSidebar, setCollapsed }}>
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

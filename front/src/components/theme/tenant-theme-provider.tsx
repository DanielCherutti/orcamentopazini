"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import {
    applyTenantAppearanceToDocument,
    persistTenantAppearance,
    readStoredTenantAppearance,
    type TenantAppearance,
} from "@/lib/tenant-theme";

type TenantThemeContextValue = {
    appearance: TenantAppearance;
    setAppearance: (appearance: TenantAppearance) => void;
    toggleAppearance: () => void;
    ready: boolean;
};

const TenantThemeContext = createContext<TenantThemeContextValue | null>(null);

export function TenantThemeProvider({ children }: { children: ReactNode }) {
    const [appearance, setAppearanceState] = useState<TenantAppearance>("dark");
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const stored = readStoredTenantAppearance();
        setAppearanceState(stored);
        applyTenantAppearanceToDocument(stored);
        setReady(true);
    }, []);

    const setAppearance = useCallback((next: TenantAppearance) => {
        setAppearanceState(next);
        persistTenantAppearance(next);
        applyTenantAppearanceToDocument(next);
    }, []);

    const toggleAppearance = useCallback(() => {
        setAppearanceState((prev) => {
            const next = prev === "dark" ? "light" : "dark";
            persistTenantAppearance(next);
            applyTenantAppearanceToDocument(next);
            return next;
        });
    }, []);

    const value = useMemo(
        () => ({ appearance, setAppearance, toggleAppearance, ready }),
        [appearance, ready, setAppearance, toggleAppearance],
    );

    return <TenantThemeContext.Provider value={value}>{children}</TenantThemeContext.Provider>;
}

export function useTenantTheme(): TenantThemeContextValue {
    const ctx = useContext(TenantThemeContext);
    if (!ctx) {
        throw new Error("useTenantTheme must be used within TenantThemeProvider");
    }
    return ctx;
}

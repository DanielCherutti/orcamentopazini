"use client";

import { createContext, useContext, useMemo } from "react";
import { platformRoleHasPermission } from "@/lib/platform-permissions";
import type { PlatformPermission, PlatformRole } from "@/types/platform-types";

type PlatformPermissionsContextValue = {
    role: PlatformRole;
    can: (permission: PlatformPermission) => boolean;
};

const PlatformPermissionsContext = createContext<PlatformPermissionsContextValue | null>(
    null,
);

export function PlatformPermissionsProvider({
    role,
    children,
}: {
    role: PlatformRole;
    children: React.ReactNode;
}) {
    const value = useMemo(
        () => ({
            role,
            can: (permission: PlatformPermission) =>
                platformRoleHasPermission(role, permission),
        }),
        [role],
    );

    return (
        <PlatformPermissionsContext.Provider value={value}>
            {children}
        </PlatformPermissionsContext.Provider>
    );
}

export function usePlatformPermissions(): PlatformPermissionsContextValue {
    const ctx = useContext(PlatformPermissionsContext);
    if (!ctx) {
        throw new Error("usePlatformPermissions must be used within PlatformPermissionsProvider");
    }
    return ctx;
}

"use client";

import type { ReactNode } from "react";
import { ConfirmDialogProvider } from "@/components/providers/confirm-dialog-provider";
import { GlobalBudgetEmailSyncProvider } from "@/components/providers/global-budget-email-sync";
import { TenantThemeProvider } from "@/components/theme/tenant-theme-provider";

export function MainAppProviders({ children }: { children: ReactNode }) {
    return (
        <TenantThemeProvider>
            <ConfirmDialogProvider>
                <GlobalBudgetEmailSyncProvider>{children}</GlobalBudgetEmailSyncProvider>
            </ConfirmDialogProvider>
        </TenantThemeProvider>
    );
}

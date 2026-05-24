"use client";

import type { ReactNode } from "react";
import { ConfirmDialogProvider } from "@/components/providers/confirm-dialog-provider";
import { GlobalBudgetEmailSyncProvider } from "@/components/providers/global-budget-email-sync";

export function MainAppProviders({ children }: { children: ReactNode }) {
    return (
        <ConfirmDialogProvider>
            <GlobalBudgetEmailSyncProvider>{children}</GlobalBudgetEmailSyncProvider>
        </ConfirmDialogProvider>
    );
}

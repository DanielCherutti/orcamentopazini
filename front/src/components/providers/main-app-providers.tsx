"use client";

import type { ReactNode } from "react";
import { ConfirmDialogProvider } from "@/components/providers/confirm-dialog-provider";

export function MainAppProviders({ children }: { children: ReactNode }) {
    return <ConfirmDialogProvider>{children}</ConfirmDialogProvider>;
}

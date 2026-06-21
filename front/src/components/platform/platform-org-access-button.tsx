"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { getLoginDestinationsAction, exitPlatformToOrgPickerAction } from "@/actions/login-routing-actions";

export function PlatformOrgAccessButton({ variant = "sidebar" }: { variant?: "sidebar" | "header" }) {
    const [hasOrgs, setHasOrgs] = useState(false);

    useEffect(() => {
        void getLoginDestinationsAction().then((res) => {
            if (res.success && res.data) {
                setHasOrgs(res.data.tenants.length > 0);
            }
        });
    }, []);

    if (!hasOrgs) return null;

    if (variant === "header") {
        return (
            <form action={exitPlatformToOrgPickerAction}>
                <button
                    type="submit"
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                    <Building2 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    <span className="hidden sm:inline">Ir para empresa</span>
                </button>
            </form>
        );
    }

    return (
        <form action={exitPlatformToOrgPickerAction} className="mb-2">
            <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-white"
            >
                <Building2 className="h-4 w-4" />
                Ir para empresa
            </button>
        </form>
    );
}

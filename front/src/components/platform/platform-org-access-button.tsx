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
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-violet-300 bg-violet-100 px-4 text-sm font-bold text-violet-800 transition-colors hover:bg-violet-200 hover:text-violet-950"
                >
                    <Building2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Ir para empresa</span>
                </button>
            </form>
        );
    }

    return (
        <form action={exitPlatformToOrgPickerAction} className="mb-2">
            <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-violet-50 px-3 py-2.5 text-sm text-slate-700 transition-colors hover:border-violet-300 hover:bg-violet-100 hover:text-violet-900"
            >
                <Building2 className="h-4 w-4" />
                Ir para empresa
            </button>
        </form>
    );
}

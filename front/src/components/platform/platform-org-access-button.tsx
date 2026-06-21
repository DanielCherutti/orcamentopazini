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
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-violet-400/40 bg-violet-500/20 px-4 text-sm font-bold text-violet-100 transition-colors hover:bg-violet-500/35 hover:text-white"
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
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-slate-200 transition-colors hover:border-violet-400/30 hover:bg-violet-500/20 hover:text-white"
            >
                <Building2 className="h-4 w-4" />
                Ir para empresa
            </button>
        </form>
    );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { endImpersonationAndRedirectAction } from "@/actions/platform-impersonation-actions";
import { Button } from "@/components/ui/button";
import { Headphones, LogOut, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export function SupportModeBanner({
    tenantName,
    tenantSlug,
    adminEmail,
    expiresAt,
    mode,
}: {
    tenantName: string;
    tenantSlug: string;
    adminEmail: string;
    expiresAt: string;
    mode: "readonly" | "full";
}) {
    const [pending, startTransition] = useTransition();
    const [remaining, setRemaining] = useState("");

    useEffect(() => {
        function tick() {
            const ms = Date.parse(expiresAt) - Date.now();
            if (ms <= 0) {
                setRemaining("expirado");
                return;
            }
            const min = Math.floor(ms / 60000);
            const sec = Math.floor((ms % 60000) / 1000);
            setRemaining(`${min}:${String(sec).padStart(2, "0")}`);
        }
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [expiresAt]);

    const isReadonly = mode === "readonly";

    return (
        <div
            className="relative z-[60] w-full shrink-0 border-b-2 border-amber-600 bg-gradient-to-r from-amber-500 via-amber-400 to-orange-500 shadow-[0_4px_24px_-4px_rgba(245,158,11,0.55)]"
            role="alert"
            aria-live="polite"
        >
            <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 sm:gap-4">
                    <div className="flex shrink-0 items-center gap-2 rounded-md bg-amber-950 px-3 py-1.5 shadow-md ring-2 ring-amber-950/20">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-75" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-200" />
                        </span>
                        <Headphones className="h-4 w-4 text-amber-100" aria-hidden />
                        <span className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-50 sm:text-sm">
                            Modo suporte
                        </span>
                    </div>

                    <div className="min-w-0 text-amber-950">
                        <p className="truncate text-sm font-bold sm:text-base">
                            {tenantName}
                            <span className="ml-1.5 font-mono text-xs font-semibold opacity-80 sm:text-sm">
                                ({tenantSlug})
                            </span>
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium text-amber-950/85 sm:text-sm">
                            <span className="inline-flex items-center gap-1">
                                <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                {adminEmail}
                            </span>
                            <span className="hidden text-amber-900/50 sm:inline" aria-hidden>
                                ·
                            </span>
                            <span
                                className={cn(
                                    "inline-flex rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide sm:text-xs",
                                    isReadonly
                                        ? "bg-amber-950/15 text-amber-950"
                                        : "bg-amber-950 text-amber-50",
                                )}
                            >
                                {isReadonly ? "Somente leitura" : "Acesso completo"}
                            </span>
                            <span className="hidden text-amber-900/50 sm:inline" aria-hidden>
                                ·
                            </span>
                            <span className="tabular-nums">
                                Expira em{" "}
                                <strong className="font-extrabold">{remaining}</strong>
                            </span>
                        </p>
                    </div>
                </div>

                <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={() => startTransition(() => endImpersonationAndRedirectAction())}
                    className="shrink-0 border-2 border-amber-950/30 bg-amber-950 font-semibold text-amber-50 shadow-md hover:bg-amber-900 hover:text-white"
                >
                    <LogOut className="h-4 w-4" />
                    Sair do modo suporte
                </Button>
            </div>
        </div>
    );
}

"use client";

import Link from "next/link";
import type { PlatformDashboardData } from "@/actions/platform-actions";
import { PlatformContentCard } from "@/components/layout/platform-page-shell";
import { PlanBadge } from "@/components/platform/platform-utils";
import { formatBrl, type PlanDefinition } from "@/lib/platform-license";
import type { TenantLicensePlan } from "@/types/tenant-types";
import { Button } from "@/components/ui/button";
import { ArrowRight, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

const PLAN_ACCENT: Record<TenantLicensePlan, { bar: string; ring: string; bg: string }> = {
    trial: { bar: "bg-amber-400", ring: "ring-amber-400/25", bg: "from-amber-500/15 to-transparent" },
    standard: { bar: "bg-sky-400", ring: "ring-sky-400/25", bg: "from-sky-500/15 to-transparent" },
    professional: { bar: "bg-violet-400", ring: "ring-violet-400/25", bg: "from-violet-500/15 to-transparent" },
};

type PlanRow = PlatformDashboardData["planBreakdown"][number];

function mrrSharePercent(mrrBrl: number, totalMrr: number): number {
    if (totalMrr <= 0) return 0;
    return Math.round((mrrBrl / totalMrr) * 100);
}

export function PlatformRevenueByPlan({
    planBreakdown,
    plans,
    totalMrrBrl,
}: {
    planBreakdown: PlanRow[];
    plans: Record<TenantLicensePlan, PlanDefinition>;
    totalMrrBrl: number;
}) {
    const totalActive = planBreakdown.reduce((s, r) => s + r.activeCount, 0);
    const totalRegistered = planBreakdown.reduce((s, r) => s + r.count, 0);

    return (
        <PlatformContentCard>
            <div className="border-b border-violet-500/15 px-5 py-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-700">
                            Receita por plano
                        </h2>
                        <p className="mt-1 max-w-lg text-xs text-slate-700/45">
                            MRR = licenças ativas × preço. Trials não entram na receita.
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 border-violet-500/30 bg-violet-500/10 text-slate-800 hover:bg-violet-500/20 hover:text-white"
                        asChild
                    >
                        <Link href="/platform/licenses">
                            <Pencil className="h-3.5 w-3.5" />
                            Editar preços
                        </Link>
                    </Button>
                </div>

                {totalMrrBrl > 0 ? (
                    <div className="mt-5 space-y-2">
                        <div className="flex h-2 overflow-hidden rounded-full bg-violet-950">
                            {planBreakdown.map((row) => {
                                const pct = mrrSharePercent(row.mrrBrl, totalMrrBrl);
                                if (pct <= 0) return null;
                                return (
                                    <div
                                        key={row.plan}
                                        className={cn("h-full", PLAN_ACCENT[row.plan].bar)}
                                        style={{ width: `${pct}%` }}
                                    />
                                );
                            })}
                        </div>
                    </div>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-8">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-violet-400/60">MRR total</p>
                        <p className="text-2xl font-black text-emerald-400">{formatBrl(totalMrrBrl)}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-violet-400/60">Ativas</p>
                        <p className="text-2xl font-black text-slate-900">{totalActive}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-violet-400/60">Cadastradas</p>
                        <p className="text-2xl font-black text-slate-900">{totalRegistered}</p>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 p-4 sm:grid-cols-3">
                {planBreakdown.map((row) => {
                    const def = plans[row.plan];
                    const accent = PLAN_ACCENT[row.plan];
                    const share = mrrSharePercent(row.mrrBrl, totalMrrBrl);
                    const isTrial = row.plan === "trial";

                    return (
                        <div
                            key={row.plan}
                            className={cn(
                                "rounded-lg border border-violet-500/15 bg-gradient-to-br p-4 ring-1",
                                accent.bg,
                                accent.ring,
                            )}
                        >
                            <div className="mb-3 flex items-start justify-between gap-2">
                                <PlanBadge plan={row.plan} />
                                <span className="text-right text-xs font-semibold text-slate-700/70">
                                    {formatBrl(def.monthlyPriceBrl)}/mês
                                </span>
                            </div>
                            <p className="text-sm font-semibold text-slate-900">{def.label}</p>
                            <p className="mt-3 text-2xl font-black text-emerald-400">{formatBrl(row.mrrBrl)}</p>
                            {!isTrial && row.mrrBrl > 0 ? (
                                <p className="text-xs text-slate-600/45">{share}% do MRR</p>
                            ) : null}
                            <p className="mt-3 text-xs text-slate-600/50">
                                {row.activeCount} ativa(s) · {row.count} cadastrada(s)
                            </p>
                        </div>
                    );
                })}
            </div>

            <div className="border-t border-violet-500/10 px-5 py-3">
                <Link
                    href="/platform/organizations"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-violet-900"
                >
                    Ver organizações
                    <ArrowRight className="h-3 w-3" />
                </Link>
            </div>
        </PlatformContentCard>
    );
}

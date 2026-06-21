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

const PLAN_ACCENT: Record<
    TenantLicensePlan,
    { bar: string; ring: string; bg: string }
> = {
    trial: {
        bar: "bg-amber-500",
        ring: "ring-amber-500/20",
        bg: "from-amber-500/12 to-amber-500/4",
    },
    standard: {
        bar: "bg-sky-500",
        ring: "ring-sky-500/20",
        bg: "from-sky-500/12 to-sky-500/4",
    },
    professional: {
        bar: "bg-violet-500",
        ring: "ring-violet-500/20",
        bg: "from-violet-500/12 to-violet-500/4",
    },
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
            <div className="border-b border-black/[0.04] bg-gradient-to-br from-violet-500/[0.04] to-transparent px-6 py-5 dark:border-white/[0.06]">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h2 className="text-base font-semibold tracking-tight">Receita por plano</h2>
                        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                            MRR estimado = licenças ativas × preço configurado em Planos e
                            preços. Trials não entram na receita.
                        </p>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0 rounded-xl" asChild>
                        <Link href="/platform/licenses">
                            <Pencil className="h-3.5 w-3.5" />
                            Editar preços
                        </Link>
                    </Button>
                </div>

                {totalMrrBrl > 0 ? (
                    <div className="mt-5 space-y-2">
                        <div className="flex h-2.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                            {planBreakdown.map((row) => {
                                const pct = mrrSharePercent(row.mrrBrl, totalMrrBrl);
                                if (pct <= 0) return null;
                                return (
                                    <div
                                        key={row.plan}
                                        className={cn(
                                            "h-full transition-all first:rounded-l-full last:rounded-r-full",
                                            PLAN_ACCENT[row.plan].bar,
                                        )}
                                        style={{ width: `${pct}%` }}
                                        title={`${plans[row.plan].label}: ${pct}%`}
                                    />
                                );
                            })}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {planBreakdown.map((row) => {
                                const pct = mrrSharePercent(row.mrrBrl, totalMrrBrl);
                                if (pct <= 0) return null;
                                return (
                                    <span key={row.plan} className="inline-flex items-center gap-1.5">
                                        <span
                                            className={cn(
                                                "h-2 w-2 rounded-full",
                                                PLAN_ACCENT[row.plan].bar,
                                            )}
                                        />
                                        {plans[row.plan].label} {pct}%
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-8">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            MRR total
                        </p>
                        <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                            {formatBrl(totalMrrBrl)}
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            Licenças ativas
                        </p>
                        <p className="text-2xl font-bold tabular-nums">{totalActive}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            Orgs no sistema
                        </p>
                        <p className="text-2xl font-bold tabular-nums">{totalRegistered}</p>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-3">
                {planBreakdown.map((row) => {
                    const def = plans[row.plan];
                    const accent = PLAN_ACCENT[row.plan];
                    const share = mrrSharePercent(row.mrrBrl, totalMrrBrl);
                    const inactive = Math.max(0, row.count - row.activeCount);
                    const isTrial = row.plan === "trial";

                    return (
                        <div
                            key={row.plan}
                            className={cn(
                                "relative flex flex-col rounded-2xl border border-black/[0.04] bg-gradient-to-br p-4 ring-1 dark:border-white/[0.06]",
                                accent.bg,
                                accent.ring,
                            )}
                        >
                            <div className="mb-3 flex items-start justify-between gap-2">
                                <PlanBadge plan={row.plan} />
                                <span className="text-right text-xs font-medium text-muted-foreground">
                                    {formatBrl(def.monthlyPriceBrl)}
                                    <span className="block font-normal">/ licença</span>
                                </span>
                            </div>

                            <p className="text-sm font-medium leading-snug">{def.label}</p>
                            <p className="mt-1 line-clamp-2 min-h-[2rem] text-xs text-muted-foreground">
                                {def.description}
                            </p>

                            <div className="my-4 border-t border-black/[0.04] pt-4 dark:border-white/[0.06]">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                    {isTrial ? "Custo mensal" : "Receita mensal"}
                                </p>
                                <p
                                    className={cn(
                                        "text-2xl font-bold tabular-nums",
                                        row.mrrBrl > 0
                                            ? "text-emerald-700 dark:text-emerald-400"
                                            : "text-muted-foreground",
                                    )}
                                >
                                    {formatBrl(row.mrrBrl)}
                                </p>
                                {!isTrial && totalMrrBrl > 0 && row.mrrBrl > 0 ? (
                                    <p className="text-xs text-muted-foreground">
                                        {share}% do MRR total
                                    </p>
                                ) : null}
                            </div>

                            <dl className="mt-auto space-y-2 text-sm">
                                <div className="flex justify-between gap-2">
                                    <dt className="text-muted-foreground">Ativas</dt>
                                    <dd className="font-semibold tabular-nums">{row.activeCount}</dd>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <dt className="text-muted-foreground">Cadastradas</dt>
                                    <dd className="tabular-nums">{row.count}</dd>
                                </div>
                                {inactive > 0 ? (
                                    <div className="flex justify-between gap-2">
                                        <dt className="text-muted-foreground">Inativas</dt>
                                        <dd className="tabular-nums text-muted-foreground">
                                            {inactive}
                                        </dd>
                                    </div>
                                ) : null}
                                <div className="flex justify-between gap-2 border-t border-black/[0.04] pt-2 dark:border-white/[0.06]">
                                    <dt className="text-muted-foreground">Usuários sugeridos</dt>
                                    <dd className="tabular-nums">{def.defaultMaxUsers}</dd>
                                </div>
                            </dl>

                            {row.activeCount > 0 && !isTrial ? (
                                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                                    {row.activeCount} × {formatBrl(def.monthlyPriceBrl)} ={" "}
                                    {formatBrl(row.mrrBrl)}
                                </p>
                            ) : null}

                            {row.activeCount === 0 && row.count > 0 ? (
                                <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-400">
                                    {row.count} org(s) neste plano, nenhuma ativa gerando receita.
                                </p>
                            ) : null}

                            {row.count === 0 ? (
                                <p className="mt-3 text-[11px] text-muted-foreground">
                                    Nenhuma organização neste plano ainda.
                                </p>
                            ) : null}
                        </div>
                    );
                })}
            </div>

            <div className="border-t border-black/[0.04] bg-black/[0.02] px-5 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                <Link
                    href="/platform/organizations"
                    className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:underline dark:text-violet-400"
                >
                    Ver todas as organizações
                    <ArrowRight className="h-3 w-3" />
                </Link>
            </div>
        </PlatformContentCard>
    );
}

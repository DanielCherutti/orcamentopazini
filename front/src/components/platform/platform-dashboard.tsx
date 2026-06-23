"use client";

import Link from "next/link";
import type { PlatformDashboardData } from "@/actions/platform-actions";
import { PlatformContentCard } from "@/components/layout/platform-page-shell";
import { PlatformRevenueByPlan } from "@/components/platform/platform-revenue-by-plan";
import {
    OrgAvatar,
    PlanBadge,
    UsageBar,
} from "@/components/platform/platform-utils";
import { formatBrl } from "@/lib/platform-license";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    AlertTriangle,
    ArrowRight,
    CalendarClock,
    ChevronRight,
    TrendingUp,
    Users,
    XCircle,
} from "lucide-react";
import { usePlatformPermissions } from "@/components/platform/platform-permissions-context";

function BentoHeader({
    title,
    description,
    action,
}: {
    title: string;
    description?: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="flex items-start justify-between gap-4 border-b border-violet-500/15 px-5 py-4">
            <div>
                <h2 className="text-sm font-black uppercase tracking-[0.14em] text-violet-200/90">
                    {title}
                </h2>
                {description ? (
                    <p className="mt-1 text-xs text-violet-200/45">{description}</p>
                ) : null}
            </div>
            {action}
        </div>
    );
}

function AlertIcon({ type }: { type: PlatformDashboardData["alerts"][0]["type"] }) {
    if (type === "expired") return <XCircle className="h-4 w-4 shrink-0 text-red-400" />;
    if (type === "expiring") return <CalendarClock className="h-4 w-4 shrink-0 text-amber-400" />;
    if (type === "user_limit") return <Users className="h-4 w-4 shrink-0 text-orange-400" />;
    return <AlertTriangle className="h-4 w-4 shrink-0 text-violet-300/60" />;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/10 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-300/55">{label}</p>
            <p className="mt-0.5 text-xl font-black tabular-nums text-white">{value}</p>
        </div>
    );
}

export function PlatformDashboard({
    data,
    confirmedRevenueCents = 0,
}: {
    data: PlatformDashboardData;
    confirmedRevenueCents?: number;
}) {
    const { can } = usePlatformPermissions();
    const { summary, planBreakdown, alerts, topByUsers, recentOrganizations } = data;

    return (
        <div className="space-y-6">
            {can("billing.view") ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <MiniStat label="Receita confirmada (mês)" value={formatBrl(confirmedRevenueCents / 100)} />
                    <MiniStat label="Trials ativos" value={summary.trialCount} />
                    <MiniStat label="Orçamentos (tenants)" value={summary.totalBudgets} />
                    <MiniStat label="Novas orgs (mês)" value={summary.newOrganizationsThisMonth} />
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                    <MiniStat label="Trials ativos" value={summary.trialCount} />
                    <MiniStat label="Orçamentos" value={summary.totalBudgets} />
                    <MiniStat label="Novas orgs (mês)" value={summary.newOrganizationsThisMonth} />
                </div>
            )}

            <PlatformRevenueByPlan
                planBreakdown={planBreakdown}
                plans={data.plans}
                totalMrrBrl={summary.estimatedMrrBrl}
            />

            <div className="grid gap-6 xl:grid-cols-12">
                <PlatformContentCard className="xl:col-span-4">
                    <BentoHeader
                        title="Alertas"
                        description="Precisam de ação"
                        action={
                            alerts.length > 0 ? (
                                <Badge className="rounded-md bg-red-500/20 text-red-200 hover:bg-red-500/20">
                                    {alerts.length}
                                </Badge>
                            ) : undefined
                        }
                    />
                    <div className="max-h-[420px] overflow-y-auto p-2">
                        {alerts.length === 0 ? (
                            <p className="py-12 text-center text-sm text-violet-200/40">
                                Nenhum alerta. Operação saudável.
                            </p>
                        ) : (
                            <ul className="space-y-1">
                                {alerts.map((alert) => (
                                    <li key={`${alert.type}-${alert.organization.id}`}>
                                        <Link
                                            href={`/platform/organizations/${alert.organization.slug}`}
                                            className="flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-violet-500/10"
                                        >
                                            <AlertIcon type={alert.type} />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-semibold text-violet-50">
                                                    {alert.organization.name}
                                                </p>
                                                <p className="text-xs text-violet-200/45">{alert.detail}</p>
                                            </div>
                                            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-violet-400/50" />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </PlatformContentCard>

                <PlatformContentCard className="xl:col-span-4">
                    <BentoHeader title="Top clientes" description="Por usuários" />
                    <div className="max-h-[420px] overflow-y-auto p-3">
                        {topByUsers.length === 0 ? (
                            <p className="py-12 text-center text-sm text-violet-200/40">
                                Nenhuma organização.
                            </p>
                        ) : (
                            <ul className="space-y-1">
                                {topByUsers.map((org, i) => (
                                    <li key={org.id}>
                                        <Link
                                            href={`/platform/organizations/${org.slug}`}
                                            className="flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-violet-500/10"
                                        >
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-500/20 text-xs font-black text-violet-200">
                                                {i + 1}
                                            </span>
                                            <OrgAvatar name={org.name} size="sm" />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-violet-50">
                                                    {org.name}
                                                </p>
                                                <PlanBadge plan={org.license_plan} />
                                            </div>
                                            <UsageBar used={org.member_count} max={org.max_users} />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </PlatformContentCard>

                <PlatformContentCard className="xl:col-span-4">
                    <BentoHeader
                        title="Crescimento"
                        description="Indicadores rápidos"
                    />
                    <div className="grid gap-3 p-4">
                        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-4">
                            <TrendingUp className="h-8 w-8 text-emerald-400" />
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-emerald-300/60">
                                    MRR estimado
                                </p>
                                <p className="text-2xl font-black text-white">
                                    {formatBrl(summary.estimatedMrrBrl)}
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <MiniStat label="Total orgs" value={summary.totalOrganizations} />
                            <MiniStat label="Pagantes" value={summary.paidCount} />
                        </div>
                    </div>
                </PlatformContentCard>
            </div>

            <PlatformContentCard>
                <BentoHeader
                    title="Organizações recentes"
                    action={
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-violet-300 hover:bg-violet-500/15 hover:text-white"
                            asChild
                        >
                            <Link href="/platform/organizations">
                                Ver todas
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </Button>
                    }
                />
                <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                    {recentOrganizations.map((org) => (
                        <Link
                            key={org.id}
                            href={`/platform/organizations/${org.slug}`}
                            className="group flex items-center gap-3 rounded-xl border border-violet-500/15 bg-violet-500/[0.06] p-4 transition-all hover:border-violet-400/35 hover:bg-violet-500/12"
                        >
                            <OrgAvatar name={org.name} />
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold text-violet-50 group-hover:text-white">
                                    {org.name}
                                </p>
                                <p className="truncate font-mono text-[11px] text-violet-300/45">{org.slug}</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <PlanBadge plan={org.license_plan} />
                                    <span className="text-[11px] text-violet-300/50">
                                        {org.member_count} usuário{org.member_count === 1 ? "" : "s"}
                                    </span>
                                </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-violet-500/40 group-hover:text-violet-300" />
                        </Link>
                    ))}
                </div>
            </PlatformContentCard>
        </div>
    );
}

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
    Building2,
    CalendarClock,
    ChevronRight,
    FileSpreadsheet,
    Plus,
    TrendingUp,
    Users,
    Wallet,
    XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlatformPermissions } from "@/components/platform/platform-permissions-context";

function KpiCard({
    label,
    value,
    hint,
    icon: Icon,
    accent,
}: {
    label: string;
    value: string | number;
    hint?: string;
    icon: React.ComponentType<{ className?: string }>;
    accent: "violet" | "emerald" | "sky" | "amber" | "rose";
}) {
    const accentMap = {
        violet: "from-violet-500 to-indigo-600 shadow-violet-500/25",
        emerald: "from-emerald-500 to-teal-600 shadow-emerald-500/25",
        sky: "from-sky-500 to-blue-600 shadow-sky-500/25",
        amber: "from-amber-500 to-orange-500 shadow-amber-500/25",
        rose: "from-rose-500 to-pink-600 shadow-rose-500/25",
    };

    return (
        <div className="platform-stat-card flex items-start gap-4 p-5">
            <div
                className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg",
                    accentMap[accent],
                )}
            >
                <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 pt-0.5">
                <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
                <p className="text-sm font-medium text-foreground/90">{label}</p>
                {hint ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
                ) : null}
            </div>
        </div>
    );
}

function PanelHeader({
    title,
    description,
    action,
}: {
    title: string;
    description?: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="flex flex-row items-start justify-between gap-4 border-b border-black/[0.04] px-6 py-5 dark:border-white/[0.06]">
            <div>
                <h2 className="text-base font-semibold tracking-tight">{title}</h2>
                {description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                ) : null}
            </div>
            {action}
        </div>
    );
}

function AlertIcon({ type }: { type: PlatformDashboardData["alerts"][0]["type"] }) {
    if (type === "expired") return <XCircle className="h-4 w-4 shrink-0 text-destructive" />;
    if (type === "expiring") return <CalendarClock className="h-4 w-4 shrink-0 text-amber-600" />;
    if (type === "user_limit") return <Users className="h-4 w-4 shrink-0 text-orange-600" />;
    return <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />;
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
        <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                <KpiCard
                    label="MRR estimado"
                    value={formatBrl(summary.estimatedMrrBrl)}
                    hint={`${summary.paidCount} cliente(s) pagantes`}
                    icon={Wallet}
                    accent="emerald"
                />
                {can("billing.view") ? (
                    <KpiCard
                        label="Receita confirmada (mês)"
                        value={formatBrl(confirmedRevenueCents / 100)}
                        hint="Pagamentos Asaas recebidos"
                        icon={TrendingUp}
                        accent="emerald"
                    />
                ) : null}
                <KpiCard
                    label="Organizações ativas"
                    value={summary.activeOrganizations}
                    hint={`${summary.totalOrganizations} no total`}
                    icon={Building2}
                    accent="violet"
                />
                <KpiCard
                    label="Usuários na plataforma"
                    value={summary.totalUsers}
                    icon={Users}
                    accent="sky"
                />
                <KpiCard
                    label="Orçamentos"
                    value={summary.totalBudgets}
                    hint="Todos os tenants"
                    icon={FileSpreadsheet}
                    accent="amber"
                />
                <KpiCard
                    label="Trials ativos"
                    value={summary.trialCount}
                    icon={TrendingUp}
                    accent="rose"
                />
                <KpiCard
                    label="Novas este mês"
                    value={summary.newOrganizationsThisMonth}
                    icon={Plus}
                    accent="violet"
                />
            </div>

            <PlatformRevenueByPlan
                planBreakdown={planBreakdown}
                plans={data.plans}
                totalMrrBrl={summary.estimatedMrrBrl}
            />

            <div className="grid gap-6 lg:grid-cols-2">
                <PlatformContentCard>
                    <PanelHeader
                        title="Alertas"
                        description="Licenças, limites e orgs que precisam de atenção."
                        action={
                            alerts.length > 0 ? (
                                <Badge variant="secondary" className="rounded-full">
                                    {alerts.length}
                                </Badge>
                            ) : undefined
                        }
                    />
                    <div className="px-2 pb-2">
                        {alerts.length === 0 ? (
                            <p className="py-10 text-center text-sm text-muted-foreground">
                                Nenhum alerta no momento. Tudo em ordem.
                            </p>
                        ) : (
                            <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
                                {alerts.map((alert) => (
                                    <li key={`${alert.type}-${alert.organization.id}`}>
                                        <Link
                                            href={`/platform/organizations/${alert.organization.slug}`}
                                            className="flex items-start gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-violet-500/[0.04]"
                                        >
                                            <AlertIcon type={alert.type} />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-medium">
                                                    {alert.organization.name}
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    {alert.detail}
                                                </p>
                                            </div>
                                            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </PlatformContentCard>

                <PlatformContentCard>
                    <PanelHeader
                        title="Top clientes por usuários"
                        description="Organizações com maior base de usuários."
                    />
                    <div className="px-4 pb-4">
                        {topByUsers.length === 0 ? (
                            <p className="py-10 text-center text-sm text-muted-foreground">
                                Nenhuma organização cadastrada.
                            </p>
                        ) : (
                            <ul className="space-y-1">
                                {topByUsers.map((org, i) => (
                                    <li key={org.id}>
                                        <Link
                                            href={`/platform/organizations/${org.slug}`}
                                            className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-violet-500/[0.04]"
                                        >
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-xs font-bold tabular-nums text-violet-700 dark:text-violet-300">
                                                {i + 1}
                                            </span>
                                            <OrgAvatar name={org.name} size="sm" />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-medium">{org.name}</p>
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
            </div>

            <PlatformContentCard>
                <PanelHeader
                    title="Organizações recentes"
                    description="Últimas empresas cadastradas na plataforma."
                    action={
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/platform/organizations">
                                Ver todas
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </Button>
                    }
                />
                <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
                    {recentOrganizations.map((org) => (
                        <Link
                            key={org.id}
                            href={`/platform/organizations/${org.slug}`}
                            className="group flex items-center gap-3 rounded-2xl border border-black/[0.05] bg-white/50 p-4 transition-all hover:border-violet-500/30 hover:bg-white hover:shadow-md dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:bg-white/[0.05]"
                        >
                            <OrgAvatar name={org.name} />
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-medium group-hover:text-violet-700 dark:group-hover:text-violet-300">
                                    {org.name}
                                </p>
                                <p className="truncate font-mono text-xs text-muted-foreground">
                                    {org.slug}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <PlanBadge plan={org.license_plan} />
                                    <span className="text-xs text-muted-foreground">
                                        {org.member_count} usuário
                                        {org.member_count === 1 ? "" : "s"}
                                    </span>
                                </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-violet-500" />
                        </Link>
                    ))}
                </div>
            </PlatformContentCard>
        </div>
    );
}

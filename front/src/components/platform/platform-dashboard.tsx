"use client";

import Link from "next/link";
import type { PlatformDashboardData } from "@/actions/platform-actions";
import { PlatformRevenueByPlan } from "@/components/platform/platform-revenue-by-plan";
import {
    OrgAvatar,
    PlanBadge,
    UsageBar,
} from "@/components/platform/platform-utils";
import {
    formatBrl,
} from "@/lib/platform-license";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
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
        violet: "from-violet-500/15 to-violet-500/5 text-violet-600 dark:text-violet-400",
        emerald: "from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400",
        sky: "from-sky-500/15 to-sky-500/5 text-sky-600 dark:text-sky-400",
        amber: "from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400",
        rose: "from-rose-500/15 to-rose-500/5 text-rose-600 dark:text-rose-400",
    };

    return (
        <Card className="border-border/70 shadow-sm overflow-hidden">
            <CardContent className="flex items-start gap-4 p-5">
                <div
                    className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br",
                        accentMap[accent],
                    )}
                >
                    <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
                    <p className="text-sm font-medium">{label}</p>
                    {hint && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

function AlertIcon({ type }: { type: PlatformDashboardData["alerts"][0]["type"] }) {
    if (type === "expired") return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
    if (type === "expiring") return <CalendarClock className="h-4 w-4 text-amber-600 shrink-0" />;
    if (type === "user_limit") return <Users className="h-4 w-4 text-orange-600 shrink-0" />;
    return <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />;
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
        <>
            <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                <KpiCard
                    label="MRR estimado"
                    value={formatBrl(summary.estimatedMrrBrl)}
                    hint={`${summary.paidCount} cliente(s) pagantes`}
                    icon={Wallet}
                    accent="emerald"
                />
                {can("billing.view") && (
                    <KpiCard
                        label="Receita confirmada (mês)"
                        value={formatBrl(confirmedRevenueCents / 100)}
                        hint="Pagamentos Asaas recebidos"
                        icon={TrendingUp}
                        accent="emerald"
                    />
                )}
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
                <Card className="border-border/70 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-base">Alertas</CardTitle>
                            <CardDescription>
                                Licenças, limites e orgs que precisam de atenção.
                            </CardDescription>
                        </div>
                        {alerts.length > 0 && (
                            <Badge variant="secondary">{alerts.length}</Badge>
                        )}
                    </CardHeader>
                    <CardContent>
                        {alerts.length === 0 ? (
                            <p className="py-8 text-center text-sm text-muted-foreground">
                                Nenhum alerta no momento. Tudo em ordem.
                            </p>
                        ) : (
                            <ul className="divide-y divide-border/60">
                                {alerts.map((alert) => (
                                    <li key={`${alert.type}-${alert.organization.id}`}>
                                        <Link
                                            href={`/platform/organizations/${alert.organization.slug}`}
                                            className="flex items-start gap-3 py-3 transition-colors hover:bg-muted/30 -mx-2 px-2 rounded-lg"
                                        >
                                            <AlertIcon type={alert.type} />
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium truncate">
                                                    {alert.organization.name}
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    {alert.detail}
                                                </p>
                                            </div>
                                            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50 mt-0.5" />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-border/70 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">Top clientes por usuários</CardTitle>
                        <CardDescription>Organizações com maior base de usuários.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {topByUsers.length === 0 ? (
                            <p className="py-8 text-center text-sm text-muted-foreground">
                                Nenhuma organização cadastrada.
                            </p>
                        ) : (
                            <ul className="space-y-3">
                                {topByUsers.map((org, i) => (
                                    <li key={org.id}>
                                        <Link
                                            href={`/platform/organizations/${org.slug}`}
                                            className="flex items-center gap-3 rounded-lg p-2 -mx-2 transition-colors hover:bg-muted/40"
                                        >
                                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold tabular-nums">
                                                {i + 1}
                                            </span>
                                            <OrgAvatar name={org.name} size="sm" />
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium truncate">{org.name}</p>
                                                <PlanBadge plan={org.license_plan} />
                                            </div>
                                            <UsageBar used={org.member_count} max={org.max_users} />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card className="border-border/70 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-base">Organizações recentes</CardTitle>
                        <CardDescription>Últimas empresas cadastradas na plataforma.</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/platform/organizations">
                            Ver todas
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {recentOrganizations.map((org) => (
                            <Link
                                key={org.id}
                                href={`/platform/organizations/${org.slug}`}
                                className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-all hover:border-violet-500/30 hover:shadow-md"
                            >
                                <OrgAvatar name={org.name} />
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium truncate group-hover:text-violet-700 dark:group-hover:text-violet-300">
                                        {org.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground font-mono truncate">
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
                </CardContent>
            </Card>
            </div>
        </>
    );
}

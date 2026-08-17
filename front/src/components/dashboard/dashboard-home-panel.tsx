import type { ComponentType } from "react";
import Link from "next/link";
import {
    ArrowRight,
    Boxes,
    FileSpreadsheet,
    Package,
    Plus,
    Sparkles,
    Users,
} from "lucide-react";
import type { DashboardHomeSummary } from "@/actions/dashboard-home-actions";
import { DashboardWelcomeLogo } from "@/components/dashboard/dashboard-welcome-logo";
import { DashboardContentCard } from "@/components/layout/dashboard-page-shell";
import { cn } from "@/lib/utils";

function formatShortDate(iso: string | null): string {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    } catch {
        return "—";
    }
}

function KpiCard({
    href,
    label,
    value,
    icon: Icon,
    className,
}: {
    href: string;
    label: string;
    value: number;
    icon: ComponentType<{ className?: string }>;
    className?: string;
}) {
    return (
        <Link href={href} className={cn("tenant-stat-card group block p-5", className)}>
            <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] tenant-ops-text-subtle">
                        {label}
                    </p>
                    <p className="text-4xl font-black tabular-nums tracking-tighter text-white">{value}</p>
                    <p
                        className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider"
                        style={{ color: "var(--brand-secondary)" }}
                    >
                        Abrir
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </p>
                </div>
                <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-white"
                    style={{
                        background: `linear-gradient(135deg, var(--brand-secondary) 0%, var(--primary) 100%)`,
                        boxShadow: "0 0 28px -4px rgb(var(--brand-secondary-rgb) / 0.75)",
                    }}
                    aria-hidden
                >
                    <Icon className="h-5 w-5" />
                </div>
            </div>
        </Link>
    );
}

export function DashboardHomePanel({
    data,
    errorMessage,
    logoUrl,
}: {
    data: DashboardHomeSummary | null;
    errorMessage?: string | null;
    logoUrl?: string | null;
}) {
    const counts = data?.counts ?? {
        products: 0,
        productGroups: 0,
        budgets: 0,
        clients: 0,
    };
    const recent = data?.recentBudgets ?? [];

    const shortcuts = [
        { href: "/budgets/new", label: "Novo orçamento", icon: FileSpreadsheet },
        { href: "/dashboard/products/new", label: "Novo produto", icon: Package },
        { href: "/customers/new", label: "Novo cliente", icon: Users },
        { href: "/dashboard/products/groups", label: "Grupos de produtos", icon: Boxes },
    ] as const;

    return (
        <div className="space-y-8">
            {errorMessage ? (
                <div
                    role="alert"
                    className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-900"
                >
                    {errorMessage}
                </div>
            ) : null}

            <DashboardContentCard className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                    <div className="tenant-ops-logo-frame shrink-0 rounded-2xl p-1">
                        <DashboardWelcomeLogo logoUrl={logoUrl} alt="Logomarca" />
                    </div>
                    <div className="min-w-0 space-y-1">
                        <p className="tenant-ops-text flex items-center gap-2 text-sm font-black uppercase tracking-wider">
                            <Sparkles
                                className="h-4 w-4 shrink-0 text-[color:var(--brand-secondary)]"
                                aria-hidden
                            />
                            Bem-vindo
                        </p>
                        <p className="tenant-ops-text-muted max-w-md text-sm leading-relaxed">
                            Acompanhe números do negócio e retome orçamentos recentes.
                        </p>
                    </div>
                </div>
            </DashboardContentCard>

            <section aria-labelledby="dashboard-kpis-heading">
                <h2 id="dashboard-kpis-heading" className="sr-only">
                    Indicadores
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <KpiCard href="/dashboard/products" label="Produtos" value={counts.products} icon={Package} />
                    <KpiCard
                        href="/dashboard/products/groups"
                        label="Grupos"
                        value={counts.productGroups}
                        icon={Boxes}
                    />
                    <KpiCard href="/budgets" label="Orçamentos" value={counts.budgets} icon={FileSpreadsheet} />
                    <KpiCard href="/customers" label="Clientes" value={counts.clients} icon={Users} />
                </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-5">
                <DashboardContentCard className="space-y-4 lg:col-span-2">
                    <div>
                        <h2 className="tenant-ops-text text-base font-semibold">Atalhos rápidos</h2>
                        <p className="tenant-ops-text-muted mt-1 text-sm">Comece um fluxo novo em um clique.</p>
                    </div>
                    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                        {shortcuts.map(({ href, label, icon: Icon }) => (
                            <li key={href}>
                                <Link
                                    href={href}
                                    className="tenant-ops-inset tenant-ops-inset-hover flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium tenant-ops-text transition-colors"
                                >
                                    <span
                                        className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                                        style={{
                                            background: `linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 80%, var(--brand-secondary)) 100%)`,
                                        }}
                                    >
                                        <Icon className="h-4 w-4" />
                                    </span>
                                    <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                                        {label}
                                        <Plus className="tenant-ops-text-subtle h-4 w-4 shrink-0" aria-hidden />
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </DashboardContentCard>

                <DashboardContentCard className="space-y-4 lg:col-span-3">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h2 className="tenant-ops-text text-base font-semibold">Orçamentos recentes</h2>
                            <p className="tenant-ops-text-muted mt-1 text-sm">
                                Até 5 registros, do mais recente ao mais antigo.
                            </p>
                        </div>
                        <Link
                            href="/budgets"
                            className="text-sm font-medium hover:underline"
                            style={{ color: "var(--brand-secondary)" }}
                        >
                            Ver todos
                        </Link>
                    </div>

                    {recent.length === 0 ? (
                        <div className="tenant-ops-empty rounded-xl px-4 py-10 text-center text-sm">
                            Nenhum orçamento ainda.{" "}
                            <Link
                                href="/budgets/new"
                                className="font-medium hover:underline"
                                style={{ color: "var(--brand-secondary)" }}
                            >
                                Criar primeiro orçamento
                            </Link>
                        </div>
                    ) : (
                        <ul className="tenant-ops-divide overflow-hidden rounded-xl border tenant-ops-inset divide-y">
                            {recent.map((b) => (
                                <li key={b.id}>
                                    <Link
                                        href={b.href}
                                        className="flex flex-col gap-1 px-4 py-3.5 transition-colors hover:bg-[color:rgb(var(--primary-rgb)/0.08)] sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="min-w-0">
                                            <p className="tenant-ops-text truncate font-medium">
                                                {b.code ? (
                                                    <>
                                                        <span className="tenant-ops-text-subtle">{b.code}</span>
                                                        <span className="tenant-ops-text-faint mx-2">·</span>
                                                    </>
                                                ) : null}
                                                {b.title}
                                            </p>
                                        </div>
                                        <div className="tenant-ops-text-subtle flex shrink-0 items-center gap-3 text-xs sm:text-sm">
                                            <time dateTime={b.createdAt ?? undefined}>
                                                {formatShortDate(b.createdAt)}
                                            </time>
                                            <ArrowRight
                                                className="h-4 w-4 opacity-70"
                                                style={{ color: "var(--brand-secondary)" }}
                                                aria-hidden
                                            />
                                        </div>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </DashboardContentCard>
            </div>
        </div>
    );
}

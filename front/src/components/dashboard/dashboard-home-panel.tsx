import type { ComponentType } from "react";
import Link from "next/link";
import Image from "next/image";
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
    <Link
      href={href}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-sm ring-1 ring-black/[0.03] transition-all",
        "hover:border-primary/25 hover:shadow-md hover:ring-primary/10",
        "dark:ring-white/[0.05]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
          <p className="flex items-center gap-1 text-xs font-medium text-primary opacity-90 group-hover:opacity-100">
            Abrir
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </p>
        </div>
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
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
}: {
  data: DashboardHomeSummary | null;
  errorMessage?: string | null;
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
          className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
        >
          {errorMessage}
        </div>
      ) : null}

      {/* Marca + boas-vindas */}
      <DashboardContentCard className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/40">
            <Image
              src="/logo.jpeg"
              alt="Pazini Engenharia"
              fill
              className="object-contain p-1.5"
              sizes="64px"
              priority
            />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 shrink-0 text-[#FBB03B]" aria-hidden />
              Bem-vindo ao painel
            </p>
            <p className="max-w-md text-sm text-muted-foreground leading-relaxed">
              Acompanhe números do negócio, acesse o que usa com frequência e retome orçamentos recentes.
            </p>
          </div>
        </div>
      </DashboardContentCard>

      {/* KPIs */}
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
        {/* Atalhos */}
        <DashboardContentCard className="lg:col-span-2 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Atalhos rápidos</h2>
            <p className="mt-1 text-sm text-muted-foreground">Comece um fluxo novo em um clique.</p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {shortcuts.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/25 px-3 py-3 text-sm font-medium transition-colors hover:border-primary/30 hover:bg-primary/[0.04]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-background text-primary shadow-sm ring-1 ring-border/60">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    {label}
                    <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </DashboardContentCard>

        {/* Orçamentos recentes */}
        <DashboardContentCard className="lg:col-span-3 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Orçamentos recentes</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Até 5 registros, do mais recente ao mais antigo.
              </p>
            </div>
            <Link
              href="/budgets"
              className="text-sm font-medium text-primary hover:underline"
            >
              Ver todos
            </Link>
          </div>

          {recent.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 bg-muted/15 px-4 py-10 text-center text-sm text-muted-foreground">
              Nenhum orçamento ainda.{" "}
              <Link href="/budgets/new" className="font-medium text-primary hover:underline">
                Criar primeiro orçamento
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-border/70 rounded-xl border border-border/80 overflow-hidden">
              {recent.map((b) => (
                <li key={b.id}>
                  <Link
                    href={b.href}
                    className="flex flex-col gap-1 px-4 py-3.5 transition-colors hover:bg-primary/[0.04] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {b.code ? (
                          <>
                            <span className="text-muted-foreground">{b.code}</span>
                            <span className="mx-2 text-border">·</span>
                          </>
                        ) : null}
                        {b.title}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground sm:text-sm">
                      <time dateTime={b.createdAt ?? undefined}>{formatShortDate(b.createdAt)}</time>
                      <ArrowRight className="h-4 w-4 text-primary opacity-70" aria-hidden />
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

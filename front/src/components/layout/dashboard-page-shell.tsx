import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Layout comum para páginas internas (catálogo, clientes, orçamentos):
 * fundo suave, faixa da marca e cabeçalho alinhado ao design Pazini.
 */
export function DashboardPageShell({
    title,
    description,
    action,
    children,
}: {
    title: string;
    description?: string;
    action?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="min-h-[calc(100dvh-4rem)] bg-gradient-to-b from-primary/[0.045] via-background to-background">
            <div className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
                <header className="flex flex-col gap-5 border-b border-border/60 pb-7 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0 space-y-2">
                        <div
                            className="h-1 w-11 rounded-full"
                            style={{
                                backgroundColor: "var(--brand-secondary)",
                                boxShadow: "0 0 14px rgb(var(--brand-secondary-rgb) / 0.4)",
                            }}
                            aria-hidden
                        />
                        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
                        {description ? (
                            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
                        ) : null}
                    </div>
                    {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
                </header>
                {children}
            </div>
        </div>
    );
}

/** Cartão principal do conteúdo (tabelas, formulários em lista). */
export function DashboardContentCard({
    children,
    className,
    padding = true,
}: {
    children: ReactNode;
    className?: string;
    padding?: boolean;
}) {
    return (
        <div
            className={cn(
                "rounded-2xl border border-border/80 bg-card text-card-foreground",
                "shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_-8px_rgba(46,58,135,0.08)]",
                "dark:shadow-[0_1px_3px_rgba(0,0,0,0.2)]",
                "ring-1 ring-black/[0.03] dark:ring-white/[0.06]",
                padding && "p-5 sm:p-7",
                className
            )}
        >
            {children}
        </div>
    );
}

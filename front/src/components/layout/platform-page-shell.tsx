import type { ReactNode } from "react";
import {
    SetPlatformBreadcrumbs,
    type BreadcrumbItem,
} from "@/components/layout/platform-breadcrumb-context";
import { cn } from "@/lib/utils";

export { DashboardContentCard } from "@/components/layout/dashboard-page-shell";

/**
 * Layout comum das páginas internas do painel EngHub (/platform):
 * fundo suave, faixa violet e cabeçalho alinhado ao app da empresa.
 */
export function PlatformPageShell({
    title,
    description,
    eyebrow,
    action,
    breadcrumbs,
    titleLeading,
    children,
    maxWidth = "7xl",
}: {
    title: ReactNode;
    description?: string;
    eyebrow?: string;
    action?: ReactNode;
    /** Trilha exibida no header (sobrescreve inferência por URL). */
    breadcrumbs?: BreadcrumbItem[];
    titleLeading?: ReactNode;
    children: ReactNode;
    maxWidth?: "4xl" | "5xl" | "7xl";
}) {
    const maxWidthClass =
        maxWidth === "4xl" ? "max-w-4xl" : maxWidth === "5xl" ? "max-w-5xl" : "max-w-7xl";

    return (
        <>
            {breadcrumbs ? <SetPlatformBreadcrumbs items={breadcrumbs} /> : null}
            <div className="min-h-[calc(100dvh-3.5rem)] bg-gradient-to-b from-violet-500/[0.04] via-background to-background">
                <div
                    className={cn(
                        "mx-auto space-y-6 px-4 py-7 sm:px-6 lg:px-8 lg:py-9",
                        maxWidthClass,
                    )}
                >
                    <header className="flex flex-col gap-5 border-b border-border/60 pb-7 sm:flex-row sm:items-end sm:justify-between">
                        <div className="flex min-w-0 items-start gap-4">
                            {titleLeading}
                            <div className="min-w-0 space-y-2">
                                <div
                                    className="h-1 w-11 rounded-full bg-violet-500 shadow-[0_0_14px_rgba(139,92,246,0.45)]"
                                    aria-hidden
                                />
                                {eyebrow ? (
                                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-600 dark:text-violet-400">
                                        {eyebrow}
                                    </p>
                                ) : null}
                                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                                    {title}
                                </h1>
                                {description ? (
                                    <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                                        {description}
                                    </p>
                                ) : null}
                            </div>
                        </div>
                        {action ? (
                            <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>
                        ) : null}
                    </header>
                    {children}
                </div>
            </div>
        </>
    );
}
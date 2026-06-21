import type { ReactNode } from "react";
import {
    SetPlatformBreadcrumbs,
    type BreadcrumbItem,
} from "@/components/layout/platform-breadcrumb-context";
import { cn } from "@/lib/utils";

/**
 * Painel branco/vidro usado em listas, tabelas e blocos do painel EngHub.
 */
export function PlatformContentCard({
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
                "platform-panel overflow-hidden",
                padding && "p-0",
                className,
            )}
        >
            {children}
        </div>
    );
}

/**
 * Layout das páginas internas do painel EngHub (/platform).
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
            <div className={cn("mx-auto px-4 py-8 sm:px-6 lg:px-8 lg:py-10", maxWidthClass)}>
                <header className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex min-w-0 items-start gap-5">
                        {titleLeading ? (
                            <div className="shrink-0 rounded-2xl bg-white/80 p-1 shadow-md ring-1 ring-black/[0.04] dark:bg-white/10 dark:ring-white/10">
                                {titleLeading}
                            </div>
                        ) : null}
                        <div className="min-w-0 space-y-3">
                            {eyebrow ? (
                                <span className="inline-flex items-center rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
                                    {eyebrow}
                                </span>
                            ) : null}
                            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                                {title}
                            </h1>
                            {description ? (
                                <p className="max-w-2xl text-base leading-relaxed text-foreground/75">
                                    {description}
                                </p>
                            ) : null}
                        </div>
                    </div>
                    {action ? (
                        <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>
                    ) : null}
                </header>
                <div className="space-y-6">{children}</div>
            </div>
        </>
    );
}

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
    SetPlatformBreadcrumbs,
    type BreadcrumbItem,
} from "@/components/layout/platform-breadcrumb-context";
import { cn } from "@/lib/utils";

/** Superfície de conteúdo dentro do ops layout. */
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
                "platform-ops-surface overflow-hidden",
                padding && "p-0",
                className,
            )}
        >
            {children}
        </div>
    );
}

/**
 * Layout de páginas internas — hero full-width + corpo claro.
 */
export function PlatformPageShell({
    title,
    description,
    eyebrow,
    action,
    breadcrumbs,
    titleLeading,
    backLink,
    children,
    maxWidth = "7xl",
    tone = "violet",
}: {
    title: ReactNode;
    description?: string;
    eyebrow?: string;
    action?: ReactNode;
    breadcrumbs?: BreadcrumbItem[];
    titleLeading?: ReactNode;
    backLink?: { href: string; label: string };
    children: ReactNode;
    maxWidth?: "4xl" | "5xl" | "7xl" | "full";
    tone?: "violet" | "emerald" | "amber";
}) {
    const maxWidthClass =
        maxWidth === "4xl"
            ? "max-w-4xl"
            : maxWidth === "5xl"
              ? "max-w-5xl"
              : maxWidth === "full"
                ? "max-w-[1600px]"
                : "max-w-7xl";

    return (
        <>
            {breadcrumbs ? <SetPlatformBreadcrumbs items={breadcrumbs} /> : null}
            <section
                className={cn(
                    "platform-ops-page-hero relative overflow-hidden border-b border-slate-200",
                    tone === "emerald" && "platform-ops-page-hero--emerald",
                    tone === "amber" && "platform-ops-page-hero--amber",
                )}
            >
                <div className="platform-ops-page-hero-bg absolute inset-0" aria-hidden />
                <div className={cn("relative mx-auto px-5 py-10 lg:px-8", maxWidthClass)}>
                    {backLink ? (
                        <Link
                            href={backLink.href}
                            className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition-colors hover:text-violet-700"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            {backLink.label}
                        </Link>
                    ) : null}
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="flex min-w-0 items-start gap-5">
                            {titleLeading ? (
                                <div className="shrink-0 rounded-xl border border-violet-400/30 bg-violet-500/10 p-1.5 shadow-[0_0_24px_-6px_rgba(139,92,246,0.6)]">
                                    {titleLeading}
                                </div>
                            ) : null}
                            <div className="min-w-0 space-y-3">
                                {eyebrow ? (
                                    <p className="text-[11px] font-black uppercase tracking-[0.26em] text-slate-600/70">
                                        {eyebrow}
                                    </p>
                                ) : null}
                                <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-950 sm:text-5xl">
                                    {title}
                                </h1>
                                {description ? (
                                    <p className="max-w-2xl text-base leading-relaxed text-slate-800/55">
                                        {description}
                                    </p>
                                ) : null}
                            </div>
                        </div>
                        {action ? (
                            <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>
                        ) : null}
                    </div>
                </div>
            </section>
            <div className="platform-ops-page-body">
                <div className={cn("mx-auto px-5 py-8 lg:px-8 lg:py-10", maxWidthClass)}>
                    <div className="space-y-6">{children}</div>
                </div>
            </div>
        </>
    );
}

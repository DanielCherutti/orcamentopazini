import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Layout de páginas internas do tenant — hero + corpo ops (mesmo padrão EngHub).
 */
export function DashboardPageShell({
    title,
    description,
    eyebrow,
    action,
    backLink,
    children,
    maxWidth = "7xl",
}: {
    title: string;
    description?: string;
    eyebrow?: string;
    action?: ReactNode;
    backLink?: { href: string; label: string };
    children: ReactNode;
    maxWidth?: "4xl" | "5xl" | "7xl" | "full";
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
            <section className="tenant-ops-page-hero relative overflow-hidden border-b border-white/10">
                <div className="tenant-ops-page-hero-bg absolute inset-0" aria-hidden />
                <div className={cn("relative mx-auto px-5 py-6 lg:px-8 lg:py-7", maxWidthClass)}>
                    {backLink ? (
                        <Link
                            href={backLink.href}
                            className="tenant-ops-back-link mb-4 inline-flex items-center gap-2 text-sm font-semibold transition-colors"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            {backLink.label}
                        </Link>
                    ) : null}
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div className="min-w-0 space-y-2">
                            {eyebrow ? (
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[color:rgb(var(--brand-secondary-rgb)/0.85)]">
                                    {eyebrow}
                                </p>
                            ) : null}
                            <h1 className="tenant-ops-page-title text-xl font-semibold tracking-tight text-white sm:text-2xl">
                                {title}
                            </h1>
                            {description ? (
                                <p className="tenant-ops-page-desc max-w-2xl text-sm leading-relaxed">
                                    {description}
                                </p>
                            ) : null}
                        </div>
                        {action ? (
                            <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>
                        ) : null}
                    </div>
                </div>
            </section>
            <div className="tenant-ops-page-body">
                <div className={cn("mx-auto px-5 py-8 lg:px-8 lg:py-10", maxWidthClass)}>
                    <div className="space-y-6">{children}</div>
                </div>
            </div>
        </>
    );
}

/** Superfície de conteúdo ops (tabelas, formulários, cards). */
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
                "tenant-ops-surface overflow-hidden",
                padding && "p-5 sm:p-7",
                className,
            )}
        >
            {children}
        </div>
    );
}

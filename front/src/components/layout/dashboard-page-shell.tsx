import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Layout comum para páginas internas do tenant (catálogo, clientes, orçamentos).
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
    maxWidth?: "4xl" | "5xl" | "7xl";
}) {
    const maxWidthClass =
        maxWidth === "4xl" ? "max-w-4xl" : maxWidth === "5xl" ? "max-w-5xl" : "max-w-7xl";

    return (
        <div className={cn("mx-auto px-4 py-8 sm:px-6 lg:px-8 lg:py-10", maxWidthClass)}>
            <header className="mb-8 flex flex-col gap-6">
                {backLink ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2 h-8 w-fit gap-1.5 rounded-xl text-muted-foreground"
                        asChild
                    >
                        <Link href={backLink.href}>
                            <ArrowLeft className="size-4" />
                            {backLink.label}
                        </Link>
                    </Button>
                ) : null}
                <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0 space-y-3">
                        {eyebrow ? (
                            <span
                                className="inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
                                style={{
                                    borderColor: "rgb(var(--primary-rgb) / 0.2)",
                                    backgroundColor: "rgb(var(--primary-rgb) / 0.08)",
                                    color: "var(--primary)",
                                }}
                            >
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
                    {action ? (
                        <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>
                    ) : null}
                </div>
            </header>
            <div className="space-y-6">{children}</div>
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
                "tenant-panel overflow-hidden text-card-foreground",
                padding && "p-5 sm:p-7",
                className,
            )}
        >
            {children}
        </div>
    );
}

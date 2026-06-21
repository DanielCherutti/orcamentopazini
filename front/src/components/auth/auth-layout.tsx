import type { CSSProperties, ReactNode } from "react";
import { DashboardWelcomeLogo } from "@/components/dashboard/dashboard-welcome-logo";
import { brandingCSSProperties } from "@/lib/branding-theme";
import type { HostDisplayBranding } from "@/lib/host-branding";
import { cn } from "@/lib/utils";

type Props = {
    branding: HostDisplayBranding;
    logoUrl?: string | null;
    subtitle: string;
    /** Substitui o nome da empresa no título (ex.: convite). */
    titleOverride?: string;
    children: ReactNode;
    /** Coluna extra à direita (ex.: novidades no login). */
    aside?: ReactNode;
    footer?: ReactNode;
    className?: string;
};

export function AuthLayout({
    branding,
    logoUrl,
    subtitle,
    titleOverride,
    children,
    aside,
    footer,
    className,
}: Props) {
    const themeStyle = brandingCSSProperties(
        branding.primary_color,
        branding.secondary_color,
    ) as CSSProperties;

    return (
        <div
            className={cn(
                "relative min-h-dvh overflow-hidden bg-gradient-to-b from-primary/[0.07] via-background to-background",
                className,
            )}
            style={themeStyle}
        >
            <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgb(var(--primary-rgb)/0.12),transparent)]"
                aria-hidden
            />
            <div
                className="pointer-events-none absolute -right-32 top-1/4 h-96 w-96 rounded-full blur-3xl"
                style={{ backgroundColor: "rgb(var(--brand-secondary-rgb) / 0.06)" }}
                aria-hidden
            />
            <div
                className="pointer-events-none absolute -left-24 bottom-0 h-80 w-80 rounded-full bg-primary/[0.05] blur-3xl"
                aria-hidden
            />

            <main className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-4 py-10 sm:px-6">
                <div
                    className={cn(
                        "grid w-full items-start gap-10",
                        aside
                            ? "max-w-5xl grid-cols-1 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] xl:max-w-6xl"
                            : "max-w-md grid-cols-1",
                    )}
                >
                    <div className={cn("mx-auto w-full space-y-8", aside ? "max-w-[440px] lg:mx-0" : "")}>
                        <AuthCard
                            branding={branding}
                            logoUrl={logoUrl}
                            subtitle={subtitle}
                            titleOverride={titleOverride}
                        >
                            {children}
                        </AuthCard>
                        {footer}
                    </div>
                    {aside ? <div className="mx-auto w-full lg:sticky lg:top-8 lg:mx-0">{aside}</div> : null}
                </div>
            </main>
        </div>
    );
}

function AuthCard({
    branding,
    logoUrl,
    subtitle,
    titleOverride,
    children,
}: {
    branding: HostDisplayBranding;
    logoUrl?: string | null;
    subtitle: string;
    titleOverride?: string;
    children: ReactNode;
}) {
    return (
        <div className="rounded-2xl border border-border/80 bg-card/95 p-8 shadow-[0_8px_40px_-12px_rgb(var(--primary-rgb)/0.18)] ring-1 ring-black/[0.04] backdrop-blur-sm dark:bg-card/90 dark:ring-white/[0.06] sm:p-10">
            <div
                className="mx-auto mb-6 h-1 w-14 rounded-full"
                style={{
                    backgroundColor: "var(--brand-secondary)",
                    boxShadow: "0 0 20px rgb(var(--brand-secondary-rgb) / 0.45)",
                }}
                aria-hidden
            />
            <div className="flex flex-col items-center gap-4 text-center">
                <DashboardWelcomeLogo logoUrl={logoUrl} alt="" />
                <div className="min-w-0 space-y-1">
                    <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                        {titleOverride ?? branding.company_name}
                    </h1>
                    <p className="text-sm text-muted-foreground">{subtitle}</p>
                </div>
            </div>
            <div className="mt-8">{children}</div>
        </div>
    );
}

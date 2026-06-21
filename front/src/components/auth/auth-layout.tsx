import type { CSSProperties, ReactNode } from "react";
import { DashboardWelcomeLogo } from "@/components/dashboard/dashboard-welcome-logo";
import { brandingCSSProperties } from "@/lib/branding-theme";
import type { HostDisplayBranding } from "@/lib/host-branding";
import { cn } from "@/lib/utils";

type Props = {
    branding: HostDisplayBranding;
    logoUrl?: string | null;
    subtitle: string;
    titleOverride?: string;
    children: ReactNode;
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

    const title = formatAuthTitle(titleOverride ?? branding.company_name);

    return (
        <div className={cn("auth-app min-h-dvh", className)} style={themeStyle}>
            <div className="auth-mesh-bg relative min-h-dvh">
                <main className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-4 py-10 sm:px-6">
                    <div className={cn("w-full", aside ? "max-w-[920px]" : "max-w-[400px]")}>
                        <div className="auth-shell overflow-hidden">
                            <div className={cn("auth-shell-grid", aside && "auth-shell-grid--split")}>
                                <div className="auth-login-col">
                                    <AuthHeader
                                        branding={branding}
                                        logoUrl={logoUrl}
                                        subtitle={subtitle}
                                        title={title}
                                    />
                                    <div className="mt-8">{children}</div>
                                </div>
                                {aside ? <div className="auth-aside-col">{aside}</div> : null}
                            </div>
                        </div>
                        {footer ? <div className="auth-footer mt-6 text-center">{footer}</div> : null}
                    </div>
                </main>
            </div>
        </div>
    );
}

function AuthHeader({
    branding,
    logoUrl,
    subtitle,
    title,
}: {
    branding: HostDisplayBranding;
    logoUrl?: string | null;
    subtitle: string;
    title: string;
}) {
    return (
        <header className="flex flex-col items-center gap-4 text-center">
            <div className="auth-logo-wrap shrink-0 rounded-xl p-2">
                <DashboardWelcomeLogo logoUrl={logoUrl} alt="" />
            </div>
            <div className="min-w-0 space-y-1">
                <h1 className="auth-page-title text-lg font-semibold leading-snug tracking-tight">
                    {title}
                </h1>
                {branding.company_header_subtitle ? (
                    <p className="auth-muted text-[11px] font-medium tracking-wide">
                        {branding.company_header_subtitle}
                    </p>
                ) : null}
                <p className="auth-muted mx-auto max-w-[280px] text-sm leading-relaxed">{subtitle}</p>
            </div>
        </header>
    );
}

/** Evita título gritando em CAPS quando vem assim do cadastro. */
function formatAuthTitle(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return trimmed;
    const letters = trimmed.replace(/[^a-zA-ZÀ-ú]/g, "");
    if (letters.length < 4) return trimmed;
    const isAllCaps = letters === letters.toUpperCase();
    if (!isAllCaps) return trimmed;
    return trimmed
        .toLowerCase()
        .replace(/(^|\s|\.)([\p{L}])/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

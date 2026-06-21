import type { Metadata } from "next";
import { getDashboardHomeSummaryAction } from "@/actions/dashboard-home-actions";
import { getProposalSettingsAction } from "@/actions/settings-actions";
import { DashboardHomePanel } from "@/components/dashboard/dashboard-home-panel";
import { DashboardPageShell } from "@/components/layout/dashboard-page-shell";

export const metadata: Metadata = {
    title: "Início",
};

function resolveDashboardLogoUrl(settingsLogo: string | undefined | null): string | null {
    const fromSettings = typeof settingsLogo === "string" ? settingsLogo.trim() : "";
    if (fromSettings) return fromSettings;
    const fromEnv = process.env.NEXT_PUBLIC_BRAND_LOGO_URL?.trim();
    if (fromEnv) return fromEnv;
    return null;
}

export default async function DashboardHomePage() {
    const [summary, settings] = await Promise.all([
        getDashboardHomeSummaryAction(),
        getProposalSettingsAction(),
    ]);

    const logoUrl = resolveDashboardLogoUrl(
        settings.success ? settings.data?.company_logo_url : null
    );

    return (
        <DashboardPageShell
            title="Início"
            description="Indicadores, atalhos e orçamentos recentes."
        >
            <DashboardHomePanel
                data={summary.success ? summary.data ?? null : null}
                errorMessage={summary.success ? null : summary.error}
                logoUrl={logoUrl}
            />
        </DashboardPageShell>
    );
}

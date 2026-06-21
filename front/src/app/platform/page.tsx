import type { Metadata } from "next";
import { getPlatformDashboardAction } from "@/actions/platform-actions";
import { getConfirmedRevenueThisMonthAction } from "@/actions/platform-billing-actions";
import { PlatformPageShell } from "@/components/layout/platform-page-shell";
import { PlatformPageError } from "@/components/layout/page-error-alert";
import { PlatformDashboard } from "@/components/platform/platform-dashboard";
import { PlatformDashboardHeaderActions } from "@/components/platform/platform-dashboard-header-actions";
import { PRODUCT_NAME } from "@/lib/product-brand";

export const metadata: Metadata = {
    title: "Dashboard",
};

export default async function PlatformHomePage() {
    const [dash, revenue] = await Promise.all([
        getPlatformDashboardAction(),
        getConfirmedRevenueThisMonthAction(),
    ]);

    if (!dash.success || !dash.data) {
        return (
            <PlatformPageError
                pageTitle="Dashboard"
                message={dash.error ?? "Erro ao carregar dashboard."}
            />
        );
    }

    return (
        <PlatformPageShell
            eyebrow={`${PRODUCT_NAME} · Painel comercial`}
            title="Dashboard"
            description="Visão geral da operação SaaS: clientes, receita estimada, alertas e crescimento."
            action={<PlatformDashboardHeaderActions />}
        >
            <PlatformDashboard
                data={dash.data}
                confirmedRevenueCents={revenue.success ? revenue.amountCents ?? 0 : 0}
            />
        </PlatformPageShell>
    );
}

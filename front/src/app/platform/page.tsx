import type { Metadata } from "next";
import { getPlatformDashboardAction } from "@/actions/platform-actions";
import { getConfirmedRevenueThisMonthAction } from "@/actions/platform-billing-actions";
import { SetPlatformBreadcrumbs } from "@/components/layout/platform-breadcrumb-context";
import { PlatformPageError } from "@/components/layout/page-error-alert";
import { PlatformDashboard } from "@/components/platform/platform-dashboard";
import { PlatformDashboardHeaderActions } from "@/components/platform/platform-dashboard-header-actions";
import { PlatformMissionHero } from "@/components/platform/platform-mission-hero";

export const metadata: Metadata = {
    title: "Mission Control",
};

export default async function PlatformHomePage() {
    const [dash, revenue] = await Promise.all([
        getPlatformDashboardAction(),
        getConfirmedRevenueThisMonthAction(),
    ]);

    if (!dash.success || !dash.data) {
        return (
            <PlatformPageError
                pageTitle="Mission Control"
                message={dash.error ?? "Erro ao carregar dashboard."}
            />
        );
    }

    const { summary } = dash.data;

    return (
        <>
            <SetPlatformBreadcrumbs items={[{ label: "Mission Control" }]} />
            <PlatformMissionHero
                mrrBrl={summary.estimatedMrrBrl}
                activeOrgs={summary.activeOrganizations}
                totalUsers={summary.totalUsers}
                paidCount={summary.paidCount}
                action={<PlatformDashboardHeaderActions />}
            />
            <div className="platform-ops-page-body">
                <div className="mx-auto max-w-[1600px] space-y-6 px-5 py-8 lg:px-8 lg:py-10">
                    <PlatformDashboard
                        data={dash.data}
                        confirmedRevenueCents={revenue.success ? revenue.amountCents ?? 0 : 0}
                    />
                </div>
            </div>
        </>
    );
}

import type { Metadata } from "next";
import { getPlatformDashboardAction } from "@/actions/platform-actions";
import { getConfirmedRevenueThisMonthAction } from "@/actions/platform-billing-actions";
import { PlatformDashboard } from "@/components/platform/platform-dashboard";

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
            <div className="p-8">
                <p className="text-destructive">
                    {dash.error ?? "Erro ao carregar dashboard."}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-8 p-8">
            <PlatformDashboard
                data={dash.data}
                confirmedRevenueCents={revenue.success ? revenue.amountCents ?? 0 : 0}
            />
        </div>
    );
}

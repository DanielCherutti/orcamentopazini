import type { Metadata } from "next";
import { getDashboardHomeSummaryAction } from "@/actions/dashboard-home-actions";
import { DashboardHomePanel } from "@/components/dashboard/dashboard-home-panel";
import { DashboardPageShell } from "@/components/layout/dashboard-page-shell";

export const metadata: Metadata = {
    title: "Início",
};

export default async function DashboardHomePage() {
    const summary = await getDashboardHomeSummaryAction();

    return (
        <DashboardPageShell
            title="Início"
            description="Resumo do cadastro e acesso rápido à operação do dia a dia."
        >
            <DashboardHomePanel
                data={summary.success ? summary.data ?? null : null}
                errorMessage={summary.success ? null : summary.error}
            />
        </DashboardPageShell>
    );
}

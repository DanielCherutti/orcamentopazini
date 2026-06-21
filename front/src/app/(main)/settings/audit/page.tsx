import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listTenantAuditLogAction, ensureAuditReadyAction } from "@/actions/audit-actions";
import { assertPortalAdminSession } from "@/lib/tenant-context";
import { DashboardContentCard, DashboardPageShell } from "@/components/layout/dashboard-page-shell";
import { PageErrorAlert } from "@/components/layout/page-error-alert";
import { AuditLogTable } from "@/components/platform/audit-log-table";

export const metadata: Metadata = {
    title: "Auditoria",
};

type Props = {
    searchParams: Promise<{ search?: string; action?: string }>;
};

export default async function SettingsAuditPage({ searchParams }: Props) {
    const auth = await assertPortalAdminSession();
    if (!auth.ok) redirect("/settings");

    await ensureAuditReadyAction();
    const sp = await searchParams;

    const audit = await listTenantAuditLogAction({
        search: sp.search,
        action: sp.action,
        limit: 100,
        offset: 0,
    });

    return (
        <DashboardPageShell
            title="Auditoria"
            description="Registro de ações realizadas nesta organização."
            backLink={{ href: "/settings", label: "Configurações" }}
        >
            <DashboardContentCard padding={false} className="overflow-hidden">
                <div className="border-b border-border/60 px-5 py-4 sm:px-7">
                    <h2 className="text-base font-semibold">Histórico</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Últimas operações de usuários e administradores.
                    </p>
                </div>
                <div className="p-5 sm:p-7">
                    {!audit.success ? (
                        <PageErrorAlert message={audit.error ?? "Erro ao carregar auditoria."} />
                    ) : (
                        <AuditLogTable
                            entries={audit.data ?? []}
                            total={audit.total ?? 0}
                            basePath="/settings/audit"
                        />
                    )}
                </div>
            </DashboardContentCard>
        </DashboardPageShell>
    );
}

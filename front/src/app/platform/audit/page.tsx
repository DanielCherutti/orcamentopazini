import type { Metadata } from "next";
import { listAuditLogAction, ensureAuditReadyAction } from "@/actions/audit-actions";
import { PlatformPageShell } from "@/components/layout/platform-page-shell";
import { PlatformPageError } from "@/components/layout/page-error-alert";
import { AuditLogTable } from "@/components/platform/audit-log-table";
import { ExportAuditCsvButton } from "@/components/platform/export-audit-csv-button";

export const metadata: Metadata = {
    title: "Auditoria",
};

type Props = {
    searchParams: Promise<{ search?: string; action?: string }>;
};

export default async function PlatformAuditPage({ searchParams }: Props) {
    await ensureAuditReadyAction();
    const sp = await searchParams;

    const audit = await listAuditLogAction({
        search: sp.search,
        action: sp.action,
        limit: 100,
        offset: 0,
    });

    if (!audit.success) {
        return (
            <PlatformPageError
                pageTitle="Auditoria"
                message={audit.error ?? "Erro ao carregar auditoria."}
                backLink={{ href: "/platform", label: "Dashboard" }}
            />
        );
    }

    return (
        <PlatformPageShell
            eyebrow="Compliance"
            title="Auditoria"
            description="Histórico de ações no painel da plataforma e nas organizações clientes."
            action={<ExportAuditCsvButton search={sp.search} action={sp.action} />}
        >
            <AuditLogTable
                entries={audit.data ?? []}
                total={audit.total ?? 0}
                basePath="/platform/audit"
            />
        </PlatformPageShell>
    );
}

import type { Metadata } from "next";
import { listAuditLogAction, ensureAuditReadyAction } from "@/actions/audit-actions";
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
            <div className="p-8">
                <p className="text-destructive">{audit.error ?? "Erro ao carregar auditoria."}</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 p-8">
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-600 dark:text-violet-400">
                    Compliance
                </p>
                <h1 className="text-3xl font-bold tracking-tight">Auditoria</h1>
                <p className="mt-1 text-muted-foreground max-w-2xl">
                    Histórico de ações no painel da plataforma e nas organizações clientes.
                </p>
            </div>
            <div className="flex items-center justify-end gap-4">
                <ExportAuditCsvButton search={sp.search} action={sp.action} />
            </div>
            <AuditLogTable
                entries={audit.data ?? []}
                total={audit.total ?? 0}
                basePath="/platform/audit"
            />
        </div>
    );
}

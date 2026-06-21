"use client";

import { useTransition } from "react";
import { exportAuditLogCsvAction } from "@/actions/audit-actions";
import { usePlatformPermissions } from "@/components/platform/platform-permissions-context";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "@/lib/toast";

export function ExportAuditCsvButton({
    search,
    action,
}: {
    search?: string;
    action?: string;
}) {
    const { can } = usePlatformPermissions();
    const [pending, startTransition] = useTransition();

    if (!can("audit.export")) return null;

    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
                startTransition(async () => {
                    const res = await exportAuditLogCsvAction({ search, action });
                    if (!res.success || !res.data) {
                        toast.error(res.error ?? "Erro ao exportar");
                        return;
                    }
                    const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success("CSV exportado");
                })
            }
        >
            <FileSpreadsheet className="h-4 w-4" />
            Exportar CSV
        </Button>
    );
}

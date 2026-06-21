"use client";

import { useTransition } from "react";
import { exportPlatformOrganizationsCsvAction } from "@/actions/platform-actions";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "@/lib/toast";

export function ExportOrganizationsCsvButton() {
    const [pending, startTransition] = useTransition();

    return (
        <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
                startTransition(async () => {
                    const res = await exportPlatformOrganizationsCsvAction();
                    if (!res.success || !res.data) {
                        toast.error(res.error ?? "Erro ao exportar");
                        return;
                    }
                    const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `organizacoes-${new Date().toISOString().slice(0, 10)}.csv`;
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

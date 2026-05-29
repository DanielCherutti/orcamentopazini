"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import type { BudgetPackageExportMode } from "@/lib/budgets/budget-package-constants";

type BudgetExportDialogProps = {
    budgetId: string;
    budgetCode?: string | null;
    variant?: "icon" | "default";
    disabled?: boolean;
};

const MODE_OPTIONS: Array<{
    value: BudgetPackageExportMode;
    label: string;
    description: string;
}> = [
    {
        value: "data",
        label: "Leve (recomendado)",
        description:
            "Só estrutura e referências de URL (geralmente alguns KB). Use quando a pasta pazini-uploads já estiver no servidor de teste (ex.: backup-full).",
    },
    {
        value: "compact",
        label: "Compacto",
        description:
            "Imagens redimensionadas (~1400px). Não inclui fotos “composed” do anotador — bem menor que o completo.",
    },
    {
        value: "full",
        label: "Completo",
        description: "Todos os arquivos originais. Pode gerar pacotes de centenas de MB em orçamentos grandes.",
    },
];

export function BudgetExportDialog({
    budgetId,
    budgetCode,
    variant = "icon",
    disabled = false,
}: BudgetExportDialogProps) {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<BudgetPackageExportMode>("data");
    const [exporting, setExporting] = useState(false);

    const handleExport = async () => {
        setExporting(true);
        try {
            const res = await fetch(
                `/api/budgets/${encodeURIComponent(budgetId)}/export?mode=${encodeURIComponent(mode)}`,
            );
            if (!res.ok) {
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                toast.error(json.error ?? "Falha na exportação");
                return;
            }

            const blob = await res.blob();
            const disposition = res.headers.get("Content-Disposition") ?? "";
            const match = disposition.match(/filename="([^"]+)"/);
            const filename =
                match?.[1] ??
                `orcamento-${(budgetCode ?? budgetId).replace(/[^\w.-]+/g, "_")}.pazini.zip`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            toast.success(
                mode === "data"
                    ? "Pacote leve exportado"
                    : mode === "compact"
                      ? "Pacote compacto exportado"
                      : "Pacote completo exportado",
            );
            setOpen(false);
        } catch {
            toast.error("Erro de rede ao exportar");
        } finally {
            setExporting(false);
        }
    };

    const trigger =
        variant === "icon" ? (
            <Button
                variant="outline"
                size="icon"
                className="rounded-sm h-8 w-8"
                title="Exportar orçamento"
                disabled={disabled}
            >
                <Download className="h-4 w-4" />
            </Button>
        ) : (
            <Button variant="outline" className="rounded-sm" disabled={disabled}>
                <Download className="h-4 w-4 mr-2" />
                Exportar
            </Button>
        );

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Exportar orçamento</DialogTitle>
                    <DialogDescription>
                        Orçamentos grandes costumam ter muitas fotos. Prefira o modo{" "}
                        <strong>Leve</strong> e copie a pasta de uploads uma vez para o ambiente de
                        teste.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                    {MODE_OPTIONS.map((opt) => (
                        <label
                            key={opt.value}
                            className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                        >
                            <input
                                type="radio"
                                name="export-mode"
                                value={opt.value}
                                checked={mode === opt.value}
                                onChange={() => setMode(opt.value)}
                                className="mt-1"
                                disabled={exporting}
                            />
                            <span className="min-w-0">
                                <span className="font-medium text-sm">{opt.label}</span>
                                <span className="block text-xs text-muted-foreground mt-0.5">
                                    {opt.description}
                                </span>
                            </span>
                        </label>
                    ))}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={exporting}>
                        Cancelar
                    </Button>
                    <Button onClick={handleExport} disabled={exporting}>
                        {exporting ? "Exportando…" : "Baixar pacote"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
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
import { budgetEditUrl } from "@/lib/budgets/budget-path";
import {
    formatBudgetPackageFileSize,
    postBudgetImportWithProgress,
    type BudgetImportUploadProgress,
} from "@/lib/budgets/budget-import-upload";
import { cn } from "@/lib/utils";

function ImportLoadingOverlay({
    fileName,
    fileSize,
    progress,
}: {
    fileName: string;
    fileSize: string;
    progress: BudgetImportUploadProgress;
}) {
    const isUpload = progress.phase === "upload";
    const title = isUpload ? "Enviando pacote…" : "Importando orçamento…";
    const subtitle = isUpload
        ? "Aguarde o envio do arquivo para o servidor."
        : "Gravando dados e imagens no banco. Pacotes completos podem levar vários minutos.";

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-background/85 backdrop-blur-sm"
            role="alertdialog"
            aria-modal="true"
            aria-busy="true"
            aria-labelledby="budget-import-loading-title"
        >
            <div className="mx-4 w-full max-w-md rounded-xl border bg-card p-8 shadow-lg">
                <div className="flex flex-col items-center text-center">
                    <LoadingSpinner size="lg" className="text-primary" />
                    <h2
                        id="budget-import-loading-title"
                        className="mt-5 text-lg font-semibold text-foreground"
                    >
                        {title}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
                    <p className="mt-4 max-w-full truncate text-xs font-medium text-foreground/80">
                        {fileName}
                    </p>
                    <p className="text-xs text-muted-foreground">{fileSize}</p>
                    <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                            className={cn(
                                "h-full rounded-full bg-primary transition-[width] duration-300 ease-out",
                                !isUpload && progress.percent < 100 && "animate-pulse",
                            )}
                            style={{ width: `${Math.max(4, progress.percent)}%` }}
                        />
                    </div>
                    <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                        {progress.percent}%
                    </p>
                </div>
            </div>
        </div>,
        document.body,
    );
}

export function BudgetImportDialog() {
    const router = useRouter();
    const fileRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [importing, setImporting] = useState(false);
    const [importOverlay, setImportOverlay] = useState<{
        fileName: string;
        fileSize: string;
        progress: BudgetImportUploadProgress;
    } | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!importing) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [importing]);

    const reset = () => {
        setTitle("");
        if (fileRef.current) fileRef.current.value = "";
    };

    const handleImport = async () => {
        const file = fileRef.current?.files?.[0];
        if (!file) {
            toast.error("Selecione um arquivo .pazini.zip");
            return;
        }

        const lower = file.name.toLowerCase();
        if (!lower.endsWith(".zip") && !lower.endsWith(".json")) {
            toast.error("Use um pacote .pazini.zip exportado pelo sistema");
            return;
        }

        const fileSizeLabel = formatBudgetPackageFileSize(file.size);
        setImporting(true);
        setImportOverlay({
            fileName: file.name,
            fileSize: fileSizeLabel,
            progress: { phase: "upload", percent: 0 },
        });

        try {
            const fd = new FormData();
            fd.append("file", file);
            if (title.trim()) fd.append("title", title.trim());

            const json = await postBudgetImportWithProgress(fd, (progress) => {
                setImportOverlay((prev) =>
                    prev
                        ? {
                              ...prev,
                              progress,
                          }
                        : prev,
                );
            });

            if (!json.success || !json.budgetId) {
                toast.error(json.error ?? "Falha na importação");
                return;
            }

            toast.success(`Orçamento importado: ${json.title ?? "OK"}`);
            setOpen(false);
            reset();
            router.push(budgetEditUrl(json.budgetId));
            router.refresh();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Erro de rede ao importar";
            toast.error(message);
        } finally {
            setImporting(false);
            setImportOverlay(null);
        }
    };

    return (
        <>
            {mounted && importOverlay ? (
                <ImportLoadingOverlay
                    fileName={importOverlay.fileName}
                    fileSize={importOverlay.fileSize}
                    progress={importOverlay.progress}
                />
            ) : null}

            <Dialog
                open={open}
                onOpenChange={(next) => {
                    if (importing) return;
                    setOpen(next);
                    if (!next) reset();
                }}
            >
                <DialogTrigger asChild>
                    <Button variant="outline" className="rounded-lg">
                        <Upload className="mr-2 h-4 w-4" />
                        Importar
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Importar orçamento</DialogTitle>
                        <DialogDescription>
                            Envie um pacote <strong>.pazini.zip</strong> exportado em modo{" "}
                            <strong>Completo</strong> ou <strong>Compacto</strong> (com pasta{" "}
                            <code className="text-xs">files/</code> dentro do ZIP). O modo{" "}
                            <strong>Leve</strong> não traz imagens — copie a pasta de uploads do servidor de origem.
                            Trechos, itens e produtos vêm no <code className="text-xs">manifest.json</code>.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div>
                            <label className="text-sm font-medium text-foreground" htmlFor="budget-import-file">
                                Arquivo do pacote
                            </label>
                            <Input
                                id="budget-import-file"
                                ref={fileRef}
                                type="file"
                                accept=".zip,.json,application/zip"
                                className="mt-1.5"
                                disabled={importing}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-foreground" htmlFor="budget-import-title">
                                Título (opcional)
                            </label>
                            <Input
                                id="budget-import-title"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Deixe vazio para usar título do pacote + “(importado)”"
                                className="mt-1.5"
                                disabled={importing}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={importing}>
                            Cancelar
                        </Button>
                        <Button onClick={handleImport} disabled={importing}>
                            Importar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export function BudgetImportDialog() {
    const router = useRouter();
    const fileRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [importing, setImporting] = useState(false);

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

        setImporting(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            if (title.trim()) fd.append("title", title.trim());

            const res = await fetch("/api/budgets/import", { method: "POST", body: fd });
            const json = (await res.json()) as {
                success?: boolean;
                budgetId?: string;
                title?: string;
                error?: string;
            };

            if (!res.ok || !json.success || !json.budgetId) {
                toast.error(json.error ?? "Falha na importação");
                return;
            }

            toast.success(`Orçamento importado: ${json.title ?? "OK"}`);
            setOpen(false);
            reset();
            router.push(budgetEditUrl(json.budgetId));
            router.refresh();
        } catch {
            toast.error("Erro de rede ao importar");
        } finally {
            setImporting(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
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
                        Envie um pacote <strong>.pazini.zip</strong> exportado de outro ambiente. No modo{" "}
                        <strong>Leve</strong>, copie antes a pasta <code className="text-xs">pazini-uploads</code>{" "}
                        para o servidor de teste (ex.: <code className="text-xs">db-backup.sh backup-full</code>) para
                        as imagens abrirem com as mesmas URLs.
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
                        {importing ? "Importando…" : "Importar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

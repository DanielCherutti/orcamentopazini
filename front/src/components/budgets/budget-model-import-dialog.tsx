"use client";

import { useMemo, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import {
  getBudgetModelImportImpactAction,
  importModeloToBudgetAction,
  listModelosAction,
  type Modelo,
  type ModeloTipo,
} from "@/actions/model-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";

const tipoLabels: Record<ModeloTipo, string> = {
  cabecalho: "Cabeçalho",
  rodape: "Rodapé",
  capa: "Capa",
  orcamento_completo: "Orçamento pronto",
};

const tipos: ModeloTipo[] = ["capa", "cabecalho", "rodape", "orcamento_completo"];

export function BudgetModelImportConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel?: () => void;
  loading?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Atenção</AlertDialogTitle>
          <AlertDialogDescription>
            Atenção: A importação deste modelo irá substituir o conteúdo atual do orçamento. Dados não salvos serão perdidos de forma irreversível. Deseja continuar?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              onCancel?.();
            }}
            disabled={loading}
          >
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={loading}>
            {loading ? "Importando..." : "Continuar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function BudgetModelImportDialog({
  budgetId,
  disabled,
  onImported,
}: {
  budgetId: string;
  disabled?: boolean;
  onImported?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [tipo, setTipo] = useState<ModeloTipo>("capa");
  const [selectedModeloId, setSelectedModeloId] = useState("");
  const [targetPageScope, setTargetPageScope] = useState<"all" | "cover" | "inner">("all");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [hasCurrentContent, setHasCurrentContent] = useState(false);

  const filtered = useMemo(
    () => modelos.filter((modelo) => modelo.tipo === tipo),
    [modelos, tipo],
  );
  const selectedModelo = modelos.find((modelo) => modelo.id === selectedModeloId);

  const loadData = async () => {
    setLoading(true);
    const [modelosRes, impactRes] = await Promise.all([
      listModelosAction(),
      getBudgetModelImportImpactAction(budgetId),
    ]);
    setLoading(false);

    if (modelosRes.success && modelosRes.data) {
      setModelos(modelosRes.data);
      const first = modelosRes.data.find((modelo) => modelo.tipo === tipo);
      setSelectedModeloId(first?.id ?? "");
    } else {
      toast.error(modelosRes.error || "Falha ao carregar modelos.");
    }

    if (impactRes.success && impactRes.data) {
      setHasCurrentContent(Boolean(impactRes.data.hasCurrentContent));
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setConfirmOpen(false);
      void loadData();
    }
  };

  const performImport = async () => {
    console.log("[IMPORT DIALOG] Starting performImport...");
    if (!selectedModeloId) {
      console.error("[IMPORT DIALOG] No selectedModeloId!");
      toast.error("Selecione um modelo para importar.");
      return;
    }
    setImporting(true);
    console.log("[IMPORT DIALOG] Calling server action importModeloToBudgetAction with:", {
      budgetId,
      selectedModeloId,
      targetPageScope
    });
    const res = await importModeloToBudgetAction(budgetId, selectedModeloId, targetPageScope);
    setImporting(false);
    console.log("[IMPORT DIALOG] Server action response:", res);
    if (!res.success) {
      toast.error(res.error || "Falha ao importar modelo.");
      return;
    }
    toast.success("Modelo importado.");
    setConfirmOpen(false);
    setOpen(false);
    console.log("[IMPORT DIALOG] Calling onImported callback...");
    await onImported?.();
  };

  const handleImportClick = () => {
    console.log("[IMPORT DIALOG] handleImportClick triggered.", {
      selectedModeloId,
      hasCurrentContent
    });
    if (!selectedModeloId) {
      toast.error("Selecione um modelo para importar.");
      return;
    }
    if (hasCurrentContent) {
      console.log("[IMPORT DIALOG] Budget has current content. Showing confirmation screen inside dialog.");
      setConfirmOpen(true);
      return;
    }
    console.log("[IMPORT DIALOG] Budget is empty. Performing import directly.");
    void performImport();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button type="button" size="sm" variant="outline" disabled={disabled}>
            <FileDown className="mr-1.5 h-3.5 w-3.5" />
            Importar Modelo
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          {confirmOpen ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-red-600">Atenção: Substituir Conteúdo</DialogTitle>
                <DialogDescription>
                  A importação deste modelo irá substituir o conteúdo atual do orçamento. Dados não salvos serão perdidos de forma irreversível. Deseja continuar?
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmOpen(false)}
                  disabled={importing}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void performImport()}
                  disabled={importing}
                >
                  {importing ? "Importando..." : "Substituir e Importar"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Importar Modelo</DialogTitle>
                <DialogDescription>
                  Escolha um modelo para aplicar ao compositor deste orçamento.
                </DialogDescription>
              </DialogHeader>

              {loading ? (
                <div className="flex items-center justify-center gap-2 rounded-md border border-dashed p-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando modelos...
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="modelo-tipo-import">Tipo</Label>
                    <select
                      id="modelo-tipo-import"
                      value={tipo}
                      onChange={(event) => {
                        const nextTipo = event.target.value as ModeloTipo;
                        setTipo(nextTipo);
                        setTargetPageScope("all");
                        const first = modelos.find((modelo) => modelo.tipo === nextTipo);
                        setSelectedModeloId(first?.id ?? "");
                      }}
                      className="h-10 w-full rounded-sm border border-input bg-background px-3 text-sm"
                    >
                      {tipos.map((item) => (
                        <option key={item} value={item}>
                          {tipoLabels[item]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="modelo-import">Modelo</Label>
                    <select
                      id="modelo-import"
                      value={selectedModeloId}
                      onChange={(event) => setSelectedModeloId(event.target.value)}
                      className="h-10 w-full rounded-sm border border-input bg-background px-3 text-sm"
                    >
                      {filtered.length === 0 ? (
                        <option value="">Nenhum modelo deste tipo</option>
                      ) : (
                        filtered.map((modelo) => (
                          <option key={modelo.id} value={modelo.id}>
                            {modelo.nome}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {(tipo === "cabecalho" || tipo === "rodape") && (
                    <div className="space-y-1.5">
                      <Label htmlFor="modelo-page-scope">Aplicar em</Label>
                      <select
                        id="modelo-page-scope"
                        value={targetPageScope}
                        onChange={(event) => setTargetPageScope(event.target.value as "all" | "cover" | "inner")}
                        className="h-10 w-full rounded-sm border border-input bg-background px-3 text-sm"
                      >
                        <option value="all">Todas as páginas (Capa + Internas)</option>
                        <option value="cover">Apenas na Capa</option>
                        <option value="inner">Apenas nas Páginas Internas</option>
                      </select>
                    </div>
                  )}

                  {selectedModelo ? (
                    <div className="space-y-1.5">
                      <Label>Pré-visualização do Conteúdo</Label>
                      <div className="max-h-48 overflow-auto rounded-md border bg-card p-4 text-xs shadow-inner">
                        {tipo === "capa" ? (
                          <div
                            className="prose prose-xs max-w-none text-foreground/90 break-words"
                            dangerouslySetInnerHTML={{ __html: selectedModelo.conteudo || "<i>Capa vazia</i>" }}
                          />
                        ) : (
                          <div className="font-sans text-foreground/80 whitespace-pre-wrap break-words">
                            {selectedModelo.conteudo || "Sem elementos configurados"}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleImportClick}
                  disabled={loading || importing || !selectedModeloId}
                >
                  Importar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}


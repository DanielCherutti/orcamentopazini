"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileDown, FileSpreadsheet, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClientSelector } from "@/components/clients/client-selector";
import { useBudgetsRepository } from "@/lib/budgets/use-budgets-repository";
import { budgetIdToPath } from "@/lib/budgets/budget-path";
import { toast } from "@/lib/toast";
import {
  importModeloToBudgetAction,
  listModelosAction,
  type Modelo,
} from "@/actions/model-actions";

export default function NewBudgetPage() {
  const router = useRouter();
  const repo = useBudgetsRepository();
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientError, setClientError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [useModel, setUseModel] = useState(false);
  const [models, setModels] = useState<Modelo[]>([]);
  const [modelId, setModelId] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);

  const loadModels = async () => {
    if (models.length > 0 || loadingModels) return;
    setLoadingModels(true);
    const result = await listModelosAction({ tipo: "orcamento_completo" });
    setLoadingModels(false);
    if (!result.success || !result.data) {
      toast.error(result.error || "Falha ao carregar modelos.");
      return;
    }
    setModels(result.data);
    setModelId((current) => current || result.data?.[0]?.id || "");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!clientId.trim()) {
      setClientError(true);
      toast.error("Selecione um cliente para criar o orçamento.");
      return;
    }
    if (useModel && !modelId) {
      toast.error("Selecione um modelo para iniciar o orçamento.");
      return;
    }

    setCreating(true);
    const result = await repo.createDraft(clientId, title.trim());

    if (result.success && result.data?.id) {
      const budgetId = String(result.data.id);
      if (useModel && modelId) {
        const imported = await importModeloToBudgetAction(budgetId, modelId);
        if (!imported.success) {
          setCreating(false);
          toast.error(
            imported.error
              ? `Orçamento criado, mas o modelo não pôde ser aplicado: ${imported.error}`
              : "Orçamento criado, mas o modelo não pôde ser aplicado.",
          );
          router.replace(`/budgets/budget/${budgetIdToPath(budgetId)}`);
          return;
        }
        toast.success("Orçamento criado a partir do modelo.");
      }
      router.replace(`/budgets/budget/${budgetIdToPath(budgetId)}`);
      return;
    }

    setCreating(false);
    toast.error(result.error || "Falha ao criar orçamento");
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Novo Orçamento</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Selecione o cliente antes de iniciar o compositor.
          </p>
        </div>
        <Button asChild variant="outline" className="rounded-sm">
          <Link href="/budgets">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Link>
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-md border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 border-b pb-4">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Dados iniciais</h2>
        </div>

        <div className="space-y-2">
          <Label htmlFor="budget-client">Cliente *</Label>
          <ClientSelector
            value={clientId}
            onSelect={(value) => {
              setClientId(value);
              setClientError(false);
            }}
            onClientSelect={(client) => {
              setClientId(String(client.id));
              setClientError(false);
            }}
            error={clientError}
          />
          {clientError ? (
            <p className="text-xs text-destructive">Cliente é obrigatório.</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="budget-title">Título</Label>
          <Input
            id="budget-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ex: Proposta Comercial - Adequações NR 12"
            className="rounded-sm"
          />
        </div>

        {useModel ? (
          <div className="space-y-3 rounded-md border border-primary/25 bg-primary/[0.04] p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <div>
                <Label htmlFor="budget-model">Modelo inicial *</Label>
                <p className="text-xs text-muted-foreground">
                  O compositor será criado com toda a estrutura deste modelo.
                </p>
              </div>
            </div>
            {loadingModels ? (
              <div className="flex items-center gap-2 rounded-sm border border-dashed p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando modelos...
              </div>
            ) : models.length ? (
              <select
                id="budget-model"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                disabled={creating}
                className="h-10 w-full rounded-sm border border-input bg-background px-3 text-sm"
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.nome}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-sm border border-dashed p-4 text-sm text-muted-foreground">
                Nenhum modelo de orçamento completo foi cadastrado.{" "}
                <Link href="/modelos/novo" className="font-medium text-primary hover:underline">
                  Criar um modelo
                </Link>
              </div>
            )}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={creating || loadingModels || (useModel && !modelId)}
            className="rounded-sm"
          >
            {creating
              ? useModel
                ? "Criando e aplicando modelo..."
                : "Criando..."
              : useModel
                ? "Criar orçamento com modelo"
                : "Criar orçamento"}
          </Button>
        </div>
      </form>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">ou</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant={useModel ? "secondary" : "outline"}
        className="h-12 w-full rounded-md border-primary/40 text-primary"
        disabled={creating || loadingModels}
        onClick={() => {
          const next = !useModel;
          setUseModel(next);
          if (next) void loadModels();
        }}
      >
        <FileDown className="mr-2 h-5 w-5" />
        {useModel ? "Criar orçamento em branco" : "Iniciar com um modelo"}
      </Button>
    </div>
  );
}

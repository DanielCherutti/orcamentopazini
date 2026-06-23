"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClientSelector } from "@/components/clients/client-selector";
import { useBudgetsRepository } from "@/lib/budgets/use-budgets-repository";
import { budgetIdToPath } from "@/lib/budgets/budget-path";
import { toast } from "@/lib/toast";

export default function NewBudgetPage() {
  const router = useRouter();
  const repo = useBudgetsRepository();
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientError, setClientError] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!clientId.trim()) {
      setClientError(true);
      toast.error("Selecione um cliente para criar o orçamento.");
      return;
    }

    setCreating(true);
    const result = await repo.createDraft(clientId, title.trim());
    setCreating(false);

    if (result.success && result.data?.id) {
      router.replace(`/budgets/budget/${budgetIdToPath(String(result.data.id))}`);
      return;
    }

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

        <div className="flex justify-end">
          <Button type="submit" disabled={creating} className="rounded-sm">
            {creating ? "Criando..." : "Criar orçamento"}
          </Button>
        </div>
      </form>
    </div>
  );
}


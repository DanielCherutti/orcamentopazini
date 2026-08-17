"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import {
  createModeloAction,
  updateModeloAction,
  type Modelo,
  type ModeloTipo,
} from "@/actions/model-actions";
import { ModelTemplateEditor } from "@/components/modelos/model-template-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createModelTemplateStructure,
  modelTemplateToLegacyContent,
  type ModelTemplateStructure,
} from "@/lib/model-template-structure";
import { toast } from "@/lib/toast";
import Link from "next/link";

const tipoLabels: Record<ModeloTipo, string> = {
  cabecalho: "Cabeçalho",
  rodape: "Rodapé",
  capa: "Capa",
  orcamento_completo: "Orçamento",
  databook_completo: "DataBook",
};

interface ModelEditorClientProps {
  initialModelo?: Modelo;
  tipo?: ModeloTipo;
}

export function ModelEditorClient({ initialModelo, tipo }: ModelEditorClientProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Determinar o tipo ativo
  const activeTipo = initialModelo ? initialModelo.tipo : (tipo ?? "cabecalho");

  // Estado local para o rascunho
  const [nome, setNome] = useState(initialModelo ? initialModelo.nome : `Novo ${tipoLabels[activeTipo].toLowerCase()}`);
  const [estrutura, setEstrutura] = useState<ModelTemplateStructure>(() => {
    if (initialModelo) {
      return initialModelo.estrutura;
    }
    return createModelTemplateStructure(activeTipo);
  });

  const handleSave = async () => {
    const trimmedNome = nome.trim();
    if (trimmedNome.length < 2) {
      toast.error("Informe um nome para o modelo.");
      return;
    }
    setSaving(true);
    const payload = {
      nome: trimmedNome,
      tipo: activeTipo,
      conteudo: modelTemplateToLegacyContent(estrutura),
      estrutura,
    };

    const result = initialModelo?.id
      ? await updateModeloAction(initialModelo.id, payload)
      : await createModeloAction(payload);

    setSaving(false);
    if (!result.success) {
      toast.error(result.error || "Falha ao salvar modelo.");
      return;
    }
    toast.success(initialModelo?.id ? "Modelo atualizado com sucesso." : "Modelo criado com sucesso.");
    
    // Redireciona de volta para a listagem
    router.push("/modelos");
    router.refresh();
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-12rem)] bg-background rounded-lg border overflow-hidden shadow-sm">
      {/* Cabeçalho de Controle de Edição */}
      <header className="border-b bg-card px-4 py-3 sm:px-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link
            href="/modelos"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background hover:bg-muted text-muted-foreground transition-colors"
            title="Voltar para Modelos"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <label htmlFor="edit-modelo-nome" className="sr-only">
              Nome do modelo
            </label>
            <Input
              id="edit-modelo-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="h-9 max-w-xl border-transparent bg-muted/40 hover:bg-muted/60 focus:bg-background text-sm font-semibold shadow-none focus-visible:border-input transition-colors"
              placeholder="Digite o nome do modelo..."
            />
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {tipoLabels[activeTipo]}
          </span>
          <Button
            type="button"
            className="h-9 gap-2 shadow-sm font-medium"
            disabled={saving || nome.trim().length < 2}
            onClick={() => void handleSave()}
          >
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : initialModelo?.id ? "Salvar Alterações" : "Criar Modelo"}
          </Button>
        </div>
      </header>

      {/* Editor visual em largura total (100%) */}
      <main className="flex-1 min-w-0 overflow-auto bg-muted/5">
        <ModelTemplateEditor
          key={`${initialModelo?.id ?? "novo"}-${activeTipo}`}
          tipo={activeTipo}
          structure={estrutura}
          onChange={setEstrutura}
        />
      </main>
    </div>
  );
}

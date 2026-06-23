import type { Metadata } from "next";
import { type ModeloTipo } from "@/actions/model-actions";
import { DashboardPageShell } from "@/components/layout/dashboard-page-shell";
import { ModelEditorClient } from "@/components/modelos/model-editor-client";

interface PageProps {
  searchParams: Promise<{ tipo?: string }>;
}

export const metadata: Metadata = {
  title: "Novo Modelo",
};

const validTipos: ModeloTipo[] = ["cabecalho", "rodape", "capa", "orcamento_completo"];

export default async function NovoModeloPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const rawTipo = searchParams.tipo;

  // Garantir tipo válido, default para cabecalho
  const tipo: ModeloTipo = validTipos.includes(rawTipo as ModeloTipo)
    ? (rawTipo as ModeloTipo)
    : "cabecalho";

  return (
    <DashboardPageShell
      title="Novo Modelo"
      description="Crie um novo modelo visual para reutilização em orçamentos."
      maxWidth="full"
      backLink={{ href: "/modelos", label: "Voltar para Modelos" }}
    >
      <ModelEditorClient tipo={tipo} />
    </DashboardPageShell>
  );
}

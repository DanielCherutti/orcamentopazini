import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getModeloAction } from "@/actions/model-actions";
import { DashboardPageShell } from "@/components/layout/dashboard-page-shell";
import { ModelEditorClient } from "@/components/modelos/model-editor-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "Editar Modelo",
};

export default async function EditModeloPage(props: PageProps) {
  const { id } = await props.params;
  const result = await getModeloAction(id);

  if (!result.success || !result.data) {
    notFound();
  }

  const modelo = result.data;

  return (
    <DashboardPageShell
      title={`Editar Modelo: ${modelo.nome}`}
      description="Personalize o cabeçalho, rodapé, capa ou estrutura de blocos do modelo."
      maxWidth="full"
      backLink={{ href: "/modelos", label: "Voltar para Modelos" }}
    >
      <ModelEditorClient initialModelo={modelo} />
    </DashboardPageShell>
  );
}

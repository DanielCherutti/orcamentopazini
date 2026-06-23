import type { Metadata } from "next";
import { listModelosAction } from "@/actions/model-actions";
import { DashboardContentCard, DashboardPageShell } from "@/components/layout/dashboard-page-shell";
import { PageErrorAlert } from "@/components/layout/page-error-alert";
import { ModelosManager } from "@/components/modelos/modelos-manager";

export const metadata: Metadata = {
  title: "Modelos",
};

export default async function ModelosPage() {
  const result = await listModelosAction();

  return (
    <DashboardPageShell
      title="Modelos"
      description="Crie documentos visuais reutilizáveis e preencha dados do cliente automaticamente."
      maxWidth="full"
    >
      <DashboardContentCard padding={false}>
        {!result.success ? (
          <PageErrorAlert message={result.error || "Erro ao carregar modelos."} />
        ) : (
          <ModelosManager initialModelos={result.data || []} />
        )}
      </DashboardContentCard>
    </DashboardPageShell>
  );
}

import type { Metadata } from "next";
import { getBudgetAction } from "@/actions/budget-actions";

export const metadata: Metadata = {
  title: "Exportar PDF",
};
import { getProposalSettingsAction } from "@/actions/settings-actions";
import { PdfClientViewer } from "@/components/pdf/pdf-client-viewer";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BudgetPdfPage({ params }: PageProps) {
  const { id } = await params;

  const [budgetRes, settingsRes] = await Promise.all([
    getBudgetAction(id),
    getProposalSettingsAction(),
  ]);

  if (!budgetRes.success || !budgetRes.data) {
    return notFound();
  }

  const settings = settingsRes.data || {};

  return (
    <PdfClientViewer
      budget={budgetRes.data}
      settings={settings}
    />
  );
}

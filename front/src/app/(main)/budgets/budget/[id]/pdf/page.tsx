import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PdfClientViewerEntry } from "@/components/pdf/pdf-client-viewer-entry";
import { loadBudgetPdfPayload } from "@/lib/budgets/budget-pdf-payload";

export const metadata: Metadata = {
  title: "Exportar PDF",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BudgetPdfPage({ params }: PageProps) {
  const { id } = await params;
  const loaded = await loadBudgetPdfPayload(id);
  if (!loaded.ok) {
    if (loaded.status === 404) return notFound();
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8 text-center text-destructive">
        {loaded.error}
      </div>
    );
  }

  return <PdfClientViewerEntry budgetId={String(loaded.budget.id)} />;
}

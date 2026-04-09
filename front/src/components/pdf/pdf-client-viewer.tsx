"use client";

import { budgetPdfApiUrl } from "@/lib/budgets/budget-path";

interface PdfClientViewerProps {
  budgetId: string;
}

export function PdfClientViewer({ budgetId }: PdfClientViewerProps) {
  const src = budgetPdfApiUrl(budgetId);

  return (
    <div className="flex h-[calc(100vh-64px)] w-full flex-col bg-slate-100">
      <div className="flex items-center justify-between bg-white p-4 shadow">
        <h1 className="text-lg font-semibold">Visualização de PDF</h1>
        <span className="text-sm text-muted-foreground">PDF gerado no servidor.</span>
      </div>
      <iframe
        title="Pré-visualização do PDF"
        src={src}
        className="min-h-0 w-full flex-1 border-none bg-white shadow-inner"
      />
    </div>
  );
}

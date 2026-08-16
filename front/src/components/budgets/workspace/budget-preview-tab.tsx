"use client";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Eye, Printer, Download } from "lucide-react";
import type { Budget } from "@/types/budget-types";
import { budgetPdfApiUrl, budgetPdfUrl } from "@/lib/budgets/budget-path";
import { DocumentGenerationProgress } from "@/components/documents/document-generation-progress";

interface BudgetPreviewTabProps {
  budget: Budget;
}

export function BudgetPreviewTab({ budget }: BudgetPreviewTabProps) {
  const budgetId = budget.id as string | undefined;

  const isClientMissing = (() => {
    type ResolvedClient = { id?: string };
    const client = budget.client_id as string | ResolvedClient;
    if (!client) return true;
    if (typeof client === "string") return client.trim().length === 0;
    if (typeof client === "object") return !client.id;
    return true;
  })();

  const handleOpenPreview = () => {
    if (!budgetId) return;
    window.open(budgetPdfUrl(budgetId), "_blank");
  };

  const handlePrint = () => {
    if (!budgetId) return;
    const w = window.open(budgetPdfApiUrl(budgetId), "_blank");
    if (!w) return;
    w.addEventListener("load", () => {
      try {
        w.print();
      } catch {
        /* ignore */
      }
    });
  };

  const pdfApiHref = budgetId ? budgetPdfApiUrl(budgetId) : "#";

  if (!budgetId) {
    return (
      <Alert>
        Não foi possível abrir o preview: ID do orçamento inválido.
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold">Preview/Exportação</div>
          <div className="text-sm text-muted-foreground">
            PDF gerado no servidor — visualização estável e download direto.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleOpenPreview}>
            <Eye className="mr-2 h-4 w-4" />
            Abrir em nova aba
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </Button>

          {!isClientMissing ? (
            <Button variant="default" asChild>
              <a href={pdfApiHref} download>
                <Download className="mr-2 h-4 w-4" />
                Baixar PDF
              </a>
            </Button>
          ) : null}
        </div>
      </Card>

      {isClientMissing ? (
        <Alert>
          Defina o cliente na aba <strong>Dados</strong> antes de exportar/baixar o PDF.
        </Alert>
      ) : null}
      {!isClientMissing ? <DocumentGenerationProgress documentType="budget" documentId={budgetId} /> : null}

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="h-[80vh] min-h-[400px] w-full">
          <iframe
            title="Pré-visualização do PDF"
            src={pdfApiHref}
            className="h-full w-full border-none bg-white"
          />
        </div>
      </div>
    </div>
  );
}

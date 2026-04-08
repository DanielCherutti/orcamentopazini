"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Printer } from "lucide-react";
import { getProposalSettingsAction, type ProposalSettings } from "@/actions/settings-actions";
import type { Budget } from "@/types/budget-types";
import { ProposalDocument } from "@/components/pdf/proposal-document";
import { PdfBlobPreviewFrame } from "@/components/pdf/pdf-blob-preview-frame";
import { budgetPdfUrl } from "@/lib/budgets/budget-path";

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((mod) => mod.PDFDownloadLink),
  { ssr: false }
);

interface BudgetPreviewTabProps {
  budget: Budget;
}

export function BudgetPreviewTab({ budget }: BudgetPreviewTabProps) {
  const [settings, setSettings] = useState<ProposalSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const budgetId = budget.id as string | undefined;

  const isClientMissing = useMemo(() => {
    // client_id pode ser string ou objeto (quando FETCH estiver habilitado)
    type ResolvedClient = { id?: string };
    const client = budget.client_id as string | ResolvedClient;
    if (!client) return true;
    if (typeof client === "string") return client.trim().length === 0;
    if (typeof client === "object") return !client.id;
    return true;
  }, [budget]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await getProposalSettingsAction();
        if (!res.success) throw new Error(res.error || "Falha ao carregar configurações");
        if (!cancelled) setSettings(res.data || {});
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro ao carregar configurações";
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenPreview = () => {
    if (!budgetId) return;
    window.open(budgetPdfUrl(budgetId), "_blank");
  };

  const handlePrint = () => {
    if (!budgetId) return;
    const w = window.open(budgetPdfUrl(budgetId), "_blank");
    if (!w) return;
    w.addEventListener("load", () => w.print());
  };

  const previewDocument = useMemo(() => {
    if (!settings) return null;
    return <ProposalDocument budget={budget} settings={settings} />;
  }, [budget, settings]);

  if (!budgetId) {
    return (
      <Alert>
        Não foi possível abrir o preview: ID do orçamento inválido.
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold">Preview/Exportação</div>
          <div className="text-sm text-muted-foreground">
            Gere o PDF em tempo real para revisão, impressão e download.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleOpenPreview}>
            <Eye className="h-4 w-4 mr-2" />
            Abrir em nova aba
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Imprimir
          </Button>

          {/* Download client-side enquanto não houver endpoint de stream */}
          {!isClientMissing && settings && (
            <PDFDownloadLink
              document={<ProposalDocument budget={budget} settings={settings} />}
              fileName={`${budget.code || "proposta"}.pdf`}
            >
              {({ loading }: { loading: boolean }) => (
                <Button disabled={loading}>
                  {loading ? "Gerando PDF..." : "Baixar PDF"}
                </Button>
              )}
            </PDFDownloadLink>
          )}
        </div>
      </Card>

      {isClientMissing && (
        <Alert>
          Defina o cliente na aba <strong>Dados</strong> antes de exportar/baixar o PDF.
        </Alert>
      )}

      {error && (
        <Alert>
          Erro ao carregar configurações do documento: {error}
        </Alert>
      )}

      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading || !settings ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-[70vh] w-full" />
          </div>
        ) : previewDocument ? (
          <div className="h-[80vh] min-h-[400px] w-full">
            <PdfBlobPreviewFrame document={previewDocument} className="h-full w-full" />
          </div>
        ) : null}
      </div>
    </div>
  );
}


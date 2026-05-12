"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateBlockAction } from "@/actions/budget-compositor-block-actions";
import { getBudgetShellAction } from "@/actions/budget-actions";
import type { BudgetBlock } from "@/types/budget-compositor-types";
import type { CoverBlockProps } from "@/types/budget-compositor-types";
import type { Budget } from "@/types/budget-types";
import { toast } from "@/lib/toast";
import { mergeCoverDocumentProps } from "@/lib/budgets/cover-document";
import { useCompositorDocument } from "@/components/budgets/compositor/compositor-document-context";
import { CompositorCoverPdfBandsDialog } from "@/components/budgets/compositor/compositor-cover-pdf-bands-dialog";

function findCoverBlock(roots: BudgetBlock[]): BudgetBlock | null {
  for (const r of roots) {
    if (r.type === "cover") return r;
    const nested = findCoverBlock(r.children ?? []);
    if (nested) return nested;
  }
  return null;
}

export function CompositorCoverPdfBandsMenuEntry({
  budgetId,
  isReadOnly,
  onRefresh,
}: {
  budgetId: string;
  isReadOnly?: boolean;
  onRefresh?: () => void;
}) {
  const doc = useCompositorDocument();
  const coverBlock = useMemo(
    () => (doc?.roots?.length ? findCoverBlock(doc.roots) : null),
    [doc?.roots],
  );

  const [props, setProps] = useState<CoverBlockProps>(() =>
    coverBlock
      ? mergeCoverDocumentProps(coverBlock.props as Record<string, unknown>)
      : mergeCoverDocumentProps({}),
  );
  const [budget, setBudget] = useState<Budget | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const coverIdRef = useRef<string | null>(null);
  coverIdRef.current = coverBlock?.id ?? null;

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const blockPropsStableKey = useMemo(
    () => JSON.stringify(coverBlock?.props ?? {}),
    [coverBlock?.props],
  );

  useEffect(() => {
    if (!coverBlock) return;
    setProps(mergeCoverDocumentProps(coverBlock.props as Record<string, unknown>));
  }, [coverBlock?.id, blockPropsStableKey]);

  useEffect(() => {
    let cancelled = false;
    getBudgetShellAction(budgetId).then((bRes) => {
      if (cancelled) return;
      if (bRes.success && bRes.data) setBudget(bRes.data as Budget);
    });
    return () => {
      cancelled = true;
    };
  }, [budgetId]);

  const persist = useDebouncedCallback(async (next: CoverBlockProps) => {
    if (isReadOnly) return;
    const id = coverIdRef.current;
    if (!id) return;
    const res = await updateBlockAction(id, budgetId, { props: next as Record<string, unknown> });
    if (!res.success) {
      toast.error(res.error || "Erro ao salvar capa");
      return;
    }
  }, 500);

  const patch = useCallback(
    (partial: Partial<CoverBlockProps>) => {
      setProps((prev) => {
        const next: CoverBlockProps = { ...prev, ...partial };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  if (!coverBlock) {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
        Nenhum bloco de capa encontrado no documento — as faixas fixas do PDF da capa não podem ser
        editadas aqui.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary/25 bg-card p-3 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            Cabeçalho e rodapé (PDF)
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Faixas fixas da primeira página (logo, nome, rodapé) fora do texto da capa — como no Word.
            O editor visual da capa fica acima; aqui ajusta só o que vai para o PDF.
          </p>
        </div>
        <Button
          type="button"
          variant="default"
          size="sm"
          className="h-8 shrink-0 text-xs sm:mt-0.5"
          disabled={isReadOnly}
          onClick={() => setDialogOpen(true)}
        >
          Abrir ajustes do PDF
        </Button>
      </div>
      <CompositorCoverPdfBandsDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            persist.flush();
            onRefreshRef.current?.();
          }
        }}
        coverProps={props}
        patch={patch}
        budget={budget}
        isReadOnly={isReadOnly}
      />
    </div>
  );
}

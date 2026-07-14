"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ABNT_DOCUMENT_MARGINS_CM,
  DEFAULT_DOCUMENT_MARGINS_CM,
  clampMarginCm,
  normalizeDocumentMargins,
  type DocumentMarginsCm,
} from "@/lib/document-page-layout";
import type { HeaderFooterBlockProps } from "@/types/budget-compositor-types";

const FIELDS: Array<{ key: keyof DocumentMarginsCm; label: string }> = [
  { key: "top", label: "Superior" },
  { key: "bottom", label: "Inferior" },
  { key: "left", label: "Esquerda" },
  { key: "right", label: "Direita" },
];

export function DocumentMarginControls({
  props,
  disabled,
  onPatch,
}: {
  props: HeaderFooterBlockProps;
  disabled?: boolean;
  onPatch: (patch: Partial<HeaderFooterBlockProps>) => void;
}) {
  const margins = normalizeDocumentMargins({
    top: props.page_margin_top_cm,
    right: props.page_margin_right_cm,
    bottom: props.page_margin_bottom_cm,
    left: props.page_margin_left_cm,
  });

  const apply = (next: DocumentMarginsCm) => onPatch({
    page_margin_top_cm: next.top,
    page_margin_right_cm: next.right,
    page_margin_bottom_cm: next.bottom,
    page_margin_left_cm: next.left,
  });

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Margens da página</div>
          <div className="text-[11px] text-muted-foreground">Valores em centímetros, compartilhados com o PDF.</div>
        </div>
        <div className="flex gap-1.5">
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => apply(ABNT_DOCUMENT_MARGINS_CM)}>
            ABNT
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => apply(DEFAULT_DOCUMENT_MARGINS_CM)}>
            Padrão
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FIELDS.map(({ key, label }) => (
          <label key={key} className="space-y-1 text-[11px] text-muted-foreground">
            <span>{label}</span>
            <div className="relative">
              <Input
                type="number"
                min={0}
                max={8}
                step={0.1}
                disabled={disabled}
                value={margins[key]}
                onChange={(event) => apply({
                  ...margins,
                  [key]: clampMarginCm(event.target.value, margins[key]),
                })}
                className="h-8 pr-8"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px]">cm</span>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

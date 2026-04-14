"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { getProposalSettingsAction, type ProposalSettings } from "@/actions/settings-actions";
import type { BudgetBlock } from "@/types/budget-compositor-types";
import { mergeCoverDocumentProps, resolveInnerPagesWatermark } from "@/lib/budgets/cover-document";
import { CompositorDocumentContext } from "./compositor-document-context";
import { buildFiguresListModel, type ScopeFigureEntry } from "./compositor-figures-utils";

export function CompositorFiguresBlock({ block }: { block: BudgetBlock; isReadOnly?: boolean }) {
  const doc = useContext(CompositorDocumentContext);
  const [settings, setSettings] = useState<ProposalSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProposalSettingsAction().then((res) => {
      if (cancelled) return;
      if (res.success && res.data) setSettings(res.data as ProposalSettings);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const coverProps = useMemo(() => {
    const cover = doc?.roots.find((b) => b.type === "cover");
    return mergeCoverDocumentProps(cover?.props as Record<string, unknown> | undefined);
  }, [doc?.roots]);

  const rows = useMemo(() => {
    if (!doc) return [];
    const entries: ScopeFigureEntry[] = doc.scopeFigures ?? [];
    return buildFiguresListModel(entries, doc.roots, doc.items);
  }, [doc]);

  const { url: wmUrl, opacity: wmOpacity } = resolveInnerPagesWatermark(coverProps);

  return (
    <div
      className="overflow-hidden rounded-lg border border-neutral-300/80 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-950"
      data-compositor-block={block.id}
    >
      <div className="relative min-h-[280px] px-6 py-5 sm:px-10 sm:py-7">
        {wmUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={wmUrl}
            alt=""
            className="pointer-events-none absolute inset-0 m-auto max-h-[78%] max-w-[78%] object-contain"
            style={{ opacity: wmOpacity }}
          />
        ) : null}

        <div className="relative z-[1] space-y-5 text-neutral-900 dark:text-neutral-100">
          <header className="flex flex-col gap-3 border-b border-neutral-200 pb-4 sm:flex-row sm:items-start sm:justify-between dark:border-neutral-700">
            <div className="flex min-w-0 items-center gap-3">
              {settings?.company_logo_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={settings.company_logo_url}
                  alt=""
                  className="h-10 w-auto max-w-[140px] object-contain sm:h-11"
                />
              ) : (
                <span className="text-sm font-bold uppercase tracking-tight">
                  {settings?.company_name || "Empresa"}
                </span>
              )}
            </div>
            <div className="text-[10px] leading-relaxed text-neutral-500 sm:text-right sm:text-[11px] dark:text-neutral-400">
              {settings?.app_public_url ? (
                <p className="break-all">
                  <span className="font-medium text-neutral-600 dark:text-neutral-300">Site: </span>
                  {settings.app_public_url}
                </p>
              ) : null}
            </div>
          </header>

          <div>
            <h2 className="font-serif text-lg font-semibold tracking-tight text-blue-800 dark:text-blue-400 sm:text-xl">
              Lista de Figuras
            </h2>
            <p className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">
              Lista automática das fotos do Escopo (locais e trechos). A descrição é obrigatória ao adicionar cada
              figura. Números de página são estimativas.
            </p>
          </div>

          {rows.length === 0 ? (
            <p className="text-sm italic text-neutral-500 dark:text-neutral-400">
              Nenhuma figura no Escopo. Adicione fotos nos locais e trechos (aba Escopo ou galeria de cada bloco no
              Compositor).
            </p>
          ) : (
            <ul className="space-y-2 text-[11px] leading-snug sm:text-xs">
              {rows.map((row) => (
                <li key={`fig-${row.n}`}>
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 shrink font-medium">
                      Figura {row.n} - {row.caption}
                    </span>
                    <span
                      className="mb-[3px] min-w-[8px] flex-1 border-b border-dotted border-neutral-400 opacity-70 dark:border-neutral-500"
                      aria-hidden
                    />
                    <span className="shrink-0 tabular-nums font-medium text-neutral-800 dark:text-neutral-200">
                      {row.page}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

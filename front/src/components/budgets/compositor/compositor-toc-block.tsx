"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { getProposalSettingsAction, type ProposalSettings } from "@/actions/settings-actions";
import type { BudgetBlock } from "@/types/budget-compositor-types";
import type { CoverBlockProps } from "@/types/budget-compositor-types";
import { mergeCoverDocumentProps } from "@/lib/budgets/cover-document";
import { cn } from "@/lib/utils";
import { CompositorDocumentContext } from "./compositor-document-context";
import { buildTocModel } from "./compositor-toc-utils";

export function CompositorTocBlock({ block }: { block: BudgetBlock; isReadOnly?: boolean }) {
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

  const entries = useMemo(() => {
    if (!doc) return [];
    return buildTocModel(doc.roots, doc.items);
  }, [doc]);

  const wmUrl = coverProps.cover_watermark_url?.trim();
  const wmOpacity = coverProps.cover_watermark_opacity ?? 0.12;

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-300/80 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-950" data-compositor-block={block.id}>
      <div className="relative min-h-[320px] px-6 py-5 sm:px-10 sm:py-7">
        {wmUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={wmUrl}
            alt=""
            className="pointer-events-none absolute inset-0 m-auto max-h-[78%] max-w-[78%] object-contain"
            style={{ opacity: wmOpacity }}
          />
        ) : null}

        <div className="relative z-[1] space-y-6 text-neutral-900 dark:text-neutral-100">
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
            <h2 className="text-lg font-semibold tracking-tight text-blue-700 dark:text-blue-400 sm:text-xl">
              Sumário
            </h2>
            <p className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">
              Atualizado automaticamente conforme as sessões do documento. Números de página são estimativas para
              visualização.
            </p>
          </div>

          {entries.length === 0 ? (
            <p className="text-sm italic text-neutral-500 dark:text-neutral-400">
              Ainda não há sessões no documento. Adicione sessões na estrutura à esquerda para preencher o sumário.
            </p>
          ) : (
            <ul className="space-y-2.5 text-[11px] sm:text-xs">
              {entries.map((e, idx) => (
                <li key={`${e.number}-${idx}`}>
                  <div
                    className="flex items-baseline gap-2"
                    style={{ paddingLeft: e.depth > 0 ? `${Math.min(e.depth, 6) * 12}px` : undefined }}
                  >
                    <span
                      className={cn(
                        "shrink-0 font-medium tabular-nums",
                        e.depth === 0 ? "uppercase" : "normal-case capitalize",
                      )}
                    >
                      {e.number}. {e.depth === 0 ? e.title.toUpperCase() : e.title}
                    </span>
                    <span
                      className="mb-[3px] min-w-[8px] flex-1 border-b border-dotted border-neutral-400 opacity-70 dark:border-neutral-500"
                      aria-hidden
                    />
                    <span className="shrink-0 tabular-nums font-medium text-neutral-800 dark:text-neutral-200">
                      {e.page}
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

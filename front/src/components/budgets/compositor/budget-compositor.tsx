"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { CompositorSidebar } from "./compositor-sidebar";
import { CompositorContent } from "./compositor-content";
import {
  getCompositorTreeAction,
  getCompositorTreeSnapshotAction,
} from "@/actions/budget-compositor-tree-actions";
import { getScopeFiguresListAction } from "@/actions/budget-scope-actions";
import { buildTree } from "@/types/budget-compositor-types";
import type { ScopeFigureEntry } from "@/components/budgets/compositor/compositor-figures-utils";
import type { BudgetBlock, CompositorTree } from "@/types/budget-compositor-types";
import type { BudgetItem, BudgetImage } from "@/types/budget-types";
import { useLiveCompositor } from "@/hooks/use-live-compositor";
import { CompositorRuntimeProvider } from "./compositor-runtime-context";

interface BudgetCompositorProps {
  budgetId: string;
  budgetCode?: string | null;
  compositorLabel: string;
  onCompositorLabelChange?: (label: string) => void | Promise<void>;
  isReadOnly?: boolean;
}

export function BudgetCompositor({
  budgetId,
  budgetCode,
  compositorLabel,
  onCompositorLabelChange,
  isReadOnly = false,
}: BudgetCompositorProps) {
  const [tree, setTree] = useState<CompositorTree | null>(null);
  const [imagesByBlock, setImagesByBlock] = useState<Record<string, BudgetImage[]>>({});
  const [scopeFigures, setScopeFigures] = useState<ScopeFigureEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCompositorTreeAction(budgetId), getScopeFiguresListAction(budgetId)]).then(
      ([result, figRes]) => {
        if (cancelled) return;
        if (result.success && result.blocks) {
          setTree(buildTree(result.blocks, result.items ?? {}));
          setImagesByBlock((result.imagesByBlock ?? {}) as Record<string, BudgetImage[]>);
        }
        if (figRes.success) {
          setScopeFigures(figRes.entries ?? []);
        } else {
          setScopeFigures([]);
        }
        setLoading(false);
      }
    );
    return () => { cancelled = true; };
  }, [budgetId]);

  const handleRefresh = useCallback(async () => {
    const [result, figRes] = await Promise.all([
      getCompositorTreeSnapshotAction(budgetId),
      getScopeFiguresListAction(budgetId),
    ]);
    if (result.success && result.blocks) {
      setTree(buildTree(result.blocks, result.items ?? {}));
      setImagesByBlock((result.imagesByBlock ?? {}) as Record<string, BudgetImage[]>);
    }
    if (figRes.success) {
      setScopeFigures(figRes.entries ?? []);
    } else {
      setScopeFigures([]);
    }
  }, [budgetId]);

  useLiveCompositor(budgetId, handleRefresh);

  const handleSelectBlock = useCallback((block: BudgetBlock) => {
    setSelectedId(block.id);
    // Scroll suave até o bloco no painel de conteúdo
    const container = scrollRef.current;
    if (!container) return;
    const target = container.querySelector(`[id="block-${block.id}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const roots = tree?.blocks ?? [];
  const items: Record<string, BudgetItem[]> = tree?.items ?? {};

  return (
    <CompositorRuntimeProvider kind="budget">
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Sidebar: índice hierárquico */}
      {sidebarOpen && (
        <CompositorSidebar
          roots={roots}
          budgetId={budgetId}
          compositorLabel={compositorLabel}
          onCompositorLabelChange={onCompositorLabelChange}
          selectedId={selectedId}
          onSelect={handleSelectBlock}
          onRefresh={handleRefresh}
          isReadOnly={isReadOnly}
        />
      )}

      {/* Documento contínuo com todos os blocos */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-background">
        {/* Toggle do sidebar */}
        <div className="shrink-0 flex items-center px-3 py-1.5 border-b border-primary/15 bg-primary/[0.02]">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-primary/60 hover:text-primary transition-colors"
            title={sidebarOpen ? "Ocultar índice" : "Mostrar índice"}
          >
            {sidebarOpen
              ? <PanelLeftClose className="h-4 w-4" />
              : <PanelLeftOpen className="h-4 w-4" />}
            <span>{sidebarOpen ? "Ocultar índice" : "Mostrar índice"}</span>
          </button>
        </div>
        <CompositorContent
          roots={roots}
          budgetId={budgetId}
          budgetCode={budgetCode}
          items={items}
          imagesByBlock={imagesByBlock}
          scopeFigures={scopeFigures}
          onRefresh={handleRefresh}
          scrollRef={scrollRef}
          isReadOnly={isReadOnly}
          selectedId={selectedId}
        />
      </div>
    </div>
    </CompositorRuntimeProvider>
  );
}

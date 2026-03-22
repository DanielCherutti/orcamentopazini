"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { CompositorSidebar } from "./compositor-sidebar";
import { CompositorContent } from "./compositor-content";
import { getCompositorTreeAction } from "@/actions/budget-compositor-tree-actions";
import { buildTree } from "@/types/budget-compositor-types";
import { findBlockInTree } from "@/components/budgets/compositor/compositor-content-utils";
import type { BudgetBlock, CompositorTree } from "@/types/budget-compositor-types";
import type { BudgetItem, BudgetImage } from "@/types/budget-types";
import { useLiveCompositor } from "@/hooks/use-live-compositor";

interface BudgetCompositorProps {
  budgetId: string;
  isReadOnly?: boolean;
}

export function BudgetCompositor({ budgetId, isReadOnly = false }: BudgetCompositorProps) {
  const [tree, setTree] = useState<CompositorTree | null>(null);
  const [imagesByBlock, setImagesByBlock] = useState<Record<string, BudgetImage[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getCompositorTreeAction(budgetId).then((result) => {
      if (cancelled) return;
      if (result.success && result.blocks) {
        setTree(buildTree(result.blocks, result.items ?? {}));
        setImagesByBlock((result.imagesByBlock ?? {}) as Record<string, BudgetImage[]>);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [budgetId]);

  const handleRefresh = useCallback(async () => {
    const result = await getCompositorTreeAction(budgetId);
    if (result.success && result.blocks) {
      setTree(buildTree(result.blocks, result.items ?? {}));
      setImagesByBlock((result.imagesByBlock ?? {}) as Record<string, BudgetImage[]>);
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
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Sidebar: índice hierárquico */}
      {sidebarOpen && (
        <CompositorSidebar
          roots={roots}
          budgetId={budgetId}
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
          items={items}
          imagesByBlock={imagesByBlock}
          onRefresh={handleRefresh}
          scrollRef={scrollRef}
          isReadOnly={isReadOnly}
          selectedId={selectedId}
        />
      </div>
    </div>
  );
}

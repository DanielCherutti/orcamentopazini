"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { CompositorSidebar } from "@/components/budgets/compositor/compositor-sidebar";
import { CompositorContent } from "@/components/budgets/compositor/compositor-content";
import { CompositorRuntimeProvider } from "@/components/budgets/compositor/compositor-runtime-context";
import {
    getDeliveryCompositorTreeAction,
    getDeliveryCompositorTreeSnapshotAction,
} from "@/actions/delivery-compositor-tree-actions";
import { buildTree } from "@/types/budget-compositor-types";
import type { BudgetBlock, CompositorTree } from "@/types/budget-compositor-types";
import type { BudgetItem } from "@/types/budget-types";

interface DeliveryCompositorProps {
    projectId: string;
    documentTitle: string;
}

/** Compositor do DataBook de entrega — mesmas ferramentas do orçamento (capa, cabeçalho/rodapé, seções, texto). */
export function DeliveryCompositor({ projectId, documentTitle }: DeliveryCompositorProps) {
    const [tree, setTree] = useState<CompositorTree | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        getDeliveryCompositorTreeAction(projectId).then((result) => {
            if (cancelled) return;
            if (result.success && result.blocks) {
                setTree(buildTree(result.blocks, result.items ?? {}));
            }
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    const handleRefresh = useCallback(async () => {
        const result = await getDeliveryCompositorTreeSnapshotAction(projectId);
        if (result.success && result.blocks) {
            setTree(buildTree(result.blocks, result.items ?? {}));
        }
    }, [projectId]);

    const handleSelectBlock = useCallback((block: BudgetBlock) => {
        setSelectedId(block.id);
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
        <CompositorRuntimeProvider kind="delivery">
            <div className="flex h-full flex-1 min-h-0 overflow-hidden border rounded-lg bg-background">
                {sidebarOpen && (
                    <CompositorSidebar
                        roots={roots}
                        budgetId={projectId}
                        compositorLabel={documentTitle}
                        selectedId={selectedId}
                        onSelect={handleSelectBlock}
                        onRefresh={handleRefresh}
                    />
                )}
                <div className="flex flex-1 flex-col min-w-0 min-h-0">
                    <div className="flex items-center gap-2 border-b px-2 py-1.5 shrink-0">
                        <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
                            onClick={() => setSidebarOpen((v) => !v)}
                            aria-label={sidebarOpen ? "Ocultar índice" : "Mostrar índice"}
                        >
                            {sidebarOpen ? (
                                <PanelLeftClose className="h-4 w-4" />
                            ) : (
                                <PanelLeftOpen className="h-4 w-4" />
                            )}
                        </button>
                        <span className="text-xs text-muted-foreground truncate">
                            Compositor do DataBook — capa, cabeçalho/rodapé e seções do memorial
                        </span>
                    </div>
                    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
                        <CompositorContent
                            roots={roots}
                            items={items}
                            imagesByBlock={{}}
                            scopeFigures={[]}
                            budgetId={projectId}
                            selectedId={selectedId}
                            onRefresh={handleRefresh}
                            scrollRef={scrollRef}
                        />
                    </div>
                </div>
            </div>
        </CompositorRuntimeProvider>
    );
}

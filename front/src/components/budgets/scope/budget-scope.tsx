"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Map, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { getLocationsAction, type ScopeLocation } from "@/actions/budget-scope-actions";
import { ScopeSidebar } from "./budget-scope-sidebar";
import { LocationDetail } from "./budget-scope-location-detail";
import { SectionDetail } from "./budget-scope-section-detail";
import type { BudgetScopeProps, Selection } from "./budget-scope-types";

export type { BudgetScopeProps, Selection } from "./budget-scope-types";

export function BudgetScope({ budgetId, isReadOnly = false }: BudgetScopeProps) {
    const [locations, setLocations] = useState<ScopeLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Selection | null>(null);
    const [scopeNumber, setScopeNumber] = useState<string>("");

    const loadLocations = useCallback(async () => {
        const result = await getLocationsAction(budgetId);
        if (result.success && result.data) {
            setLocations(result.data);
        }
    }, [budgetId]);

    const loadScopeNumber = useCallback(async () => {
        const { getCompositorTreeAction } = await import("@/actions/budget-compositor-actions");
        const { buildTree } = await import("@/types/budget-compositor-types");
        const res = await getCompositorTreeAction(budgetId);
        if (res.success && res.blocks) {
            const tree = buildTree(res.blocks);
            const flattenLocal = (nodes: typeof tree.blocks): typeof tree.blocks => {
                const out: typeof tree.blocks = [];
                for (const n of nodes) {
                    out.push(n);
                    out.push(...flattenLocal(n.children));
                }
                return out;
            };
            const scopeBlock = flattenLocal(tree.blocks).find((b) => b.type === "scope");
            if (scopeBlock) setScopeNumber(scopeBlock.number);
        }
    }, [budgetId]);

    useEffect(() => {
        Promise.all([loadLocations(), loadScopeNumber()]).finally(() => setLoading(false));
    }, [loadLocations, loadScopeNumber]);

    const [sidebarOpen, setSidebarOpen] = useState(true);

    if (loading) {
        return (
            <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="flex flex-1 min-h-0 overflow-hidden">
            {sidebarOpen && (
                <ScopeSidebar
                    budgetId={budgetId}
                    locations={locations}
                    selected={selected}
                    onSelect={setSelected}
                    onRefresh={loadLocations}
                    isReadOnly={isReadOnly}
                    scopeNumber={scopeNumber}
                />
            )}

            <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-primary/[0.015]">
                <div className="shrink-0 flex items-center px-3 py-1.5 border-b border-primary/15 bg-primary/[0.02]">
                    <button
                        type="button"
                        onClick={() => setSidebarOpen((v) => !v)}
                        className="flex items-center gap-1.5 text-xs text-primary/60 hover:text-primary transition-colors"
                        title={sidebarOpen ? "Ocultar índice" : "Mostrar índice"}
                    >
                        {sidebarOpen ? (
                            <PanelLeftClose className="h-4 w-4" />
                        ) : (
                            <PanelLeftOpen className="h-4 w-4" />
                        )}
                        <span>{sidebarOpen ? "Ocultar índice" : "Mostrar índice"}</span>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {!selected ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                            <Map className="h-12 w-12 mb-4 opacity-20" />
                            <p className="text-sm">Selecione um local ou adicione um novo para começar</p>
                        </div>
                    ) : selected.type === "location" ? (
                        <LocationDetail
                            key={selected.id}
                            locationId={selected.id}
                            location={locations.find((l) => l.id === selected.id) ?? null}
                            budgetId={budgetId}
                            isReadOnly={isReadOnly}
                            onRefresh={loadLocations}
                            onSelectSection={(sectionId) => {
                                setSelected({ type: "section", id: sectionId, locationId: selected.id });
                            }}
                        />
                    ) : (
                        <SectionDetail
                            key={selected.id}
                            sectionId={selected.id}
                            locationId={selected.locationId}
                            section={
                                locations
                                    .find((l) => l.sections.some((s) => s.id === selected.id))
                                    ?.sections.find((s) => s.id === selected.id) ?? null
                            }
                            budgetId={budgetId}
                            isReadOnly={isReadOnly}
                            onRefresh={loadLocations}
                            locations={locations}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

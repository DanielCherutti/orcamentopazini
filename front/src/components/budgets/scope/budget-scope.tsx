"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, Map as MapIcon, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { getLocationsAction, type ScopeLocation } from "@/actions/budget-scope-actions";
import { getBudgetAction, updateBudgetAction } from "@/actions/budget-actions";
import { ScopeSidebar } from "./budget-scope-sidebar";
import { LocationDetail } from "./budget-scope-location-detail";
import { SectionDetail } from "./budget-scope-section-detail";
import type { BudgetScopeProps, Selection } from "./budget-scope-types";
import type {
    CostDisplayMode,
    LocationAssemblyMode,
    PriceAdjustmentMode,
} from "@/lib/budgets/scope-pricing";
import { updateLocationAction } from "@/actions/budget-hierarchy-scope-structure-actions";

export type { BudgetScopeProps, Selection } from "./budget-scope-types";

export function BudgetScope({ budgetId, isReadOnly = false }: BudgetScopeProps) {
    const [locations, setLocations] = useState<ScopeLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Selection | null>(null);
    const [scopeNumber, setScopeNumber] = useState<string>("");
    const [showCostsOnPrint, setShowCostsOnPrint] = useState(false);
    const [costsDisplayMode, setCostsDisplayMode] = useState<CostDisplayMode>("section");
    const [priceAdjustmentEnabled, setPriceAdjustmentEnabled] = useState(false);
    const [priceAdjustmentInputMode, setPriceAdjustmentInputMode] =
        useState<PriceAdjustmentMode>("fixed");
    const [assemblyMode, setAssemblyMode] = useState<LocationAssemblyMode>("percent");
    const [assemblyValue, setAssemblyValue] = useState(0);

    const loadLocations = useCallback(async () => {
        const result = await getLocationsAction(budgetId);
        if (result.success && result.data) {
            setLocations(result.data);
        }
    }, [budgetId]);

    const loadScopeNumber = useCallback(async () => {
        const { getCompositorTreeAction } = await import("@/actions/budget-compositor-tree-actions");
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
            if (scopeBlock) {
                const rootIndex = tree.blocks.findIndex((b) => b.id === scopeBlock.id);
                setScopeNumber(rootIndex >= 0 ? String(rootIndex + 1) : "");
            }
        }
    }, [budgetId]);

    const loadBudgetCostConfig = useCallback(async () => {
        const result = await getBudgetAction(budgetId);
        if (!result.success || !result.data) return;
        setShowCostsOnPrint(!!result.data.show_costs_on_print);
        const mode = String(result.data.costs_display_mode ?? "section");
        if (mode === "location" || mode === "general") {
            setCostsDisplayMode(mode);
        } else {
            setCostsDisplayMode("section");
        }
    }, [budgetId]);

    useEffect(() => {
        Promise.all([loadLocations(), loadScopeNumber(), loadBudgetCostConfig()]).finally(() =>
            setLoading(false)
        );
    }, [loadLocations, loadScopeNumber, loadBudgetCostConfig]);

    const selectedLocation = useMemo(() => {
        if (!selected) return null;
        if (selected.type === "location") {
            return locations.find((loc) => loc.id === selected.id) ?? null;
        }
        return (
            locations.find((loc) => loc.sections.some((sec) => sec.id === selected.id)) ?? null
        );
    }, [locations, selected]);

    useEffect(() => {
        if (!selectedLocation) return;
        const modeRaw = String(
            (selectedLocation as unknown as Record<string, unknown>).assembly_mode ?? "percent"
        );
        const mode: LocationAssemblyMode =
            modeRaw === "fixed" || modeRaw === "manual" ? modeRaw : "percent";
        setAssemblyMode(mode);
        setAssemblyValue(
            Number((selectedLocation as unknown as Record<string, unknown>).assembly_value ?? 0)
        );
    }, [selectedLocation]);

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
                    key={budgetId}
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
                    {!isReadOnly && (
                        <div className="mb-4 flex flex-wrap items-center gap-2">
                            <label className="inline-flex h-7 items-center gap-1 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground">
                                <input
                                    type="checkbox"
                                    checked={showCostsOnPrint}
                                    onChange={async (e) => {
                                        const checked = e.target.checked;
                                        setShowCostsOnPrint(checked);
                                        const result = await updateBudgetAction(budgetId, {
                                            show_costs_on_print: checked,
                                        });
                                        if (!result.success) {
                                            setShowCostsOnPrint(!checked);
                                        }
                                    }}
                                    className="h-3 w-3 accent-white"
                                />
                                EXIBIR CUSTOS
                            </label>
                            {showCostsOnPrint && (
                                <select
                                    className="h-7 rounded border border-primary/60 bg-primary px-2 text-[11px] font-medium text-primary-foreground"
                                    value={costsDisplayMode}
                                    onChange={async (e) => {
                                        const mode = e.target.value as CostDisplayMode;
                                        setCostsDisplayMode(mode);
                                        const result = await updateBudgetAction(budgetId, {
                                            costs_display_mode: mode,
                                        });
                                        if (!result.success) {
                                            setCostsDisplayMode("section");
                                        }
                                    }}
                                >
                                    <option value="location">Custos por local</option>
                                    <option value="section">Custos por trecho</option>
                                    <option value="general">Custos gerais</option>
                                </select>
                            )}
                            <label className="inline-flex h-7 items-center gap-1 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground">
                                <input
                                    type="checkbox"
                                    checked={priceAdjustmentEnabled}
                                    onChange={(e) => setPriceAdjustmentEnabled(e.target.checked)}
                                    className="h-3 w-3 accent-white"
                                />
                                AJUSTE DE PREÇO
                            </label>
                            <label className="inline-flex h-7 items-center gap-1 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground">
                                <input
                                    type="checkbox"
                                    checked={priceAdjustmentInputMode === "percent"}
                                    onChange={() => setPriceAdjustmentInputMode("percent")}
                                    disabled={!priceAdjustmentEnabled}
                                    className="h-3 w-3 accent-white"
                                />
                                %
                            </label>
                            <label className="inline-flex h-7 items-center gap-1 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground">
                                <input
                                    type="checkbox"
                                    checked={priceAdjustmentInputMode === "fixed"}
                                    onChange={() => setPriceAdjustmentInputMode("fixed")}
                                    disabled={!priceAdjustmentEnabled}
                                    className="h-3 w-3 accent-white"
                                />
                                $
                            </label>
                            <label className="inline-flex h-7 items-center gap-1 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground">
                                <input
                                    type="checkbox"
                                    checked={assemblyMode === "percent"}
                                    onChange={async () => {
                                        if (!selectedLocation?.id) return;
                                        setAssemblyMode("percent");
                                        await updateLocationAction(selectedLocation.id, budgetId, {
                                            assembly_mode: "percent",
                                        });
                                        await loadLocations();
                                    }}
                                    disabled={!selectedLocation?.id}
                                    className="h-3 w-3 accent-white"
                                />
                                MONTAGEM %
                            </label>
                            <input
                                type="number"
                                value={assemblyValue}
                                onChange={(e) => setAssemblyValue(Number(e.target.value))}
                                onBlur={async () => {
                                    if (!selectedLocation?.id || assemblyMode === "manual") return;
                                    await updateLocationAction(selectedLocation.id, budgetId, {
                                        assembly_mode: assemblyMode,
                                        assembly_value: Number.isFinite(assemblyValue)
                                            ? assemblyValue
                                            : 0,
                                    });
                                    await loadLocations();
                                }}
                                disabled={!selectedLocation?.id || assemblyMode === "manual"}
                                className="h-7 w-16 rounded border border-primary/60 px-2 text-[11px]"
                            />
                            <label className="inline-flex h-7 items-center gap-1 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground">
                                <input
                                    type="checkbox"
                                    checked={assemblyMode === "fixed"}
                                    onChange={async () => {
                                        if (!selectedLocation?.id) return;
                                        setAssemblyMode("fixed");
                                        await updateLocationAction(selectedLocation.id, budgetId, {
                                            assembly_mode: "fixed",
                                        });
                                        await loadLocations();
                                    }}
                                    disabled={!selectedLocation?.id}
                                    className="h-3 w-3 accent-white"
                                />
                                MONTAGEM $
                            </label>
                            <label className="inline-flex h-7 items-center gap-1 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground">
                                <input
                                    type="checkbox"
                                    checked={assemblyMode === "manual"}
                                    onChange={async () => {
                                        if (!selectedLocation?.id) return;
                                        setAssemblyMode("manual");
                                        await updateLocationAction(selectedLocation.id, budgetId, {
                                            assembly_mode: "manual",
                                        });
                                        await loadLocations();
                                    }}
                                    disabled={!selectedLocation?.id}
                                    className="h-3 w-3 accent-white"
                                />
                                MONTAGEM MANUAL
                            </label>
                        </div>
                    )}
                    {!selected ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                            <MapIcon className="h-12 w-12 mb-4 opacity-20" />
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
                            locations={locations}
                            priceAdjustmentEnabled={priceAdjustmentEnabled}
                            priceAdjustmentInputMode={priceAdjustmentInputMode}
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
                            priceAdjustmentEnabled={priceAdjustmentEnabled}
                            priceAdjustmentInputMode={priceAdjustmentInputMode}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

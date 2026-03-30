"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
    Loader2,
    Map as MapIcon,
    PanelLeftClose,
    PanelLeftOpen,
    Settings2,
} from "lucide-react";
import { getLocationsAction, type ScopeLocation } from "@/actions/budget-scope-actions";
import { ScopeSidebar } from "./budget-scope-sidebar";
import { LocationDetail } from "./budget-scope-location-detail";
import { SectionDetail } from "./budget-scope-section-detail";
import type { BudgetScopeProps, Selection } from "./budget-scope-types";
import type {
    CostDisplayMode,
    LocationAssemblyMode,
    PriceAdjustmentMode,
} from "@/lib/budgets/scope-pricing";
import {
    updateLocationAction,
    updateSectionAction,
} from "@/actions/budget-hierarchy-scope-structure-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type { BudgetScopeProps, Selection } from "./budget-scope-types";

export function BudgetScope({
    budgetId,
    isReadOnly = false,
    quoteMarkupPercent = 0,
    quoteDiscountPercent = 0,
}: BudgetScopeProps) {
    const [locations, setLocations] = useState<ScopeLocation[]>([]);
    /** Incrementa a cada `loadLocations` bem-sucedido (itens/estrutura) para o sidebar recalcular totais por local. */
    const [scopeDataVersion, setScopeDataVersion] = useState(0);
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
    const [costConfigOpen, setCostConfigOpen] = useState(false);
    const toggleBtnClass =
        "inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

    const loadLocations = useCallback(async () => {
        const result = await getLocationsAction(budgetId);
        if (result.success && result.data) {
            setLocations(result.data);
            setScopeDataVersion((v) => v + 1);
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

    useEffect(() => {
        Promise.all([loadLocations(), loadScopeNumber()]).finally(() => setLoading(false));
    }, [loadLocations, loadScopeNumber]);

    const selectedLocation = useMemo(() => {
        if (!selected) return null;
        if (selected.type === "location") {
            return locations.find((loc) => loc.id === selected.id) ?? null;
        }
        return (
            locations.find((loc) => loc.sections.some((sec) => sec.id === selected.id)) ?? null
        );
    }, [locations, selected]);

    const selectedSection = useMemo(() => {
        if (!selected || selected.type !== "section") return null;
        return selectedLocation?.sections.find((sec) => sec.id === selected.id) ?? null;
    }, [selected, selectedLocation]);

    useEffect(() => {
        if (!selectedLocation && !selectedSection) return;
        const target = selected?.type === "section" ? selectedSection : selectedLocation;
        if (!target) return;
        setShowCostsOnPrint(
            Boolean((target as unknown as Record<string, unknown>).show_costs_on_print)
        );
        const costsModeRaw = String(
            (target as unknown as Record<string, unknown>).costs_display_mode ?? "section"
        );
        const costsMode: CostDisplayMode =
            costsModeRaw === "location" || costsModeRaw === "general" ? costsModeRaw : "section";
        setCostsDisplayMode(costsMode);
        setPriceAdjustmentEnabled(
            Boolean((target as unknown as Record<string, unknown>).price_adjustment_enabled)
        );
        const paModeRaw = String(
            (target as unknown as Record<string, unknown>).price_adjustment_input_mode ?? "fixed"
        );
        setPriceAdjustmentInputMode(paModeRaw === "percent" ? "percent" : "fixed");
        const modeRaw = String(
            (target as unknown as Record<string, unknown>).assembly_mode ?? "percent"
        );
        const mode: LocationAssemblyMode =
            modeRaw === "fixed" || modeRaw === "manual" ? modeRaw : "percent";
        setAssemblyMode(mode);
        setAssemblyValue(
            Number((target as unknown as Record<string, unknown>).assembly_value ?? 0)
        );
    }, [selected, selectedLocation, selectedSection]);

    const saveCommercialConfig = useCallback(
        async (
            patch:
                | {
                      show_costs_on_print?: boolean;
                      costs_display_mode?: CostDisplayMode;
                      price_adjustment_enabled?: boolean;
                      price_adjustment_input_mode?: PriceAdjustmentMode;
                  }
                | {
                      assembly_mode?: LocationAssemblyMode;
                      assembly_value?: number;
                  }
        ) => {
            if (!selected) return;
            if (selected.type === "location") {
                const result = await updateLocationAction(selected.id, budgetId, patch);
                if (!result.success) return false;
                await loadLocations();
                return true;
            }
            const result = await updateSectionAction(selected.id, budgetId, patch);
            if (!result.success) return false;
            await loadLocations();
            return true;
        },
        [selected, budgetId, loadLocations]
    );

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
                    scopeDataVersion={scopeDataVersion}
                    quoteMarkupPercent={quoteMarkupPercent}
                    quoteDiscountPercent={quoteDiscountPercent}
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
                        <div className="mb-4 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setCostConfigOpen((v) => !v)}
                                className="h-8 gap-1.5"
                            >
                                <Settings2 className="h-4 w-4" />
                                Configuracoes comerciais
                            </Button>
                            <span className="text-xs text-muted-foreground">
                                {selected
                                    ? `Editando ${selected.type === "location" ? "local" : "trecho"}`
                                    : "Selecione um local/trecho para editar"}
                            </span>
                            </div>
                            <div
                                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                                    costConfigOpen ? "max-h-[48rem] opacity-100" : "max-h-0 opacity-0"
                                }`}
                            >
                                <div className="rounded-lg border bg-card p-3 shadow-sm">
                                    <p className="mb-3 text-xs text-muted-foreground">
                                        Ajustes aplicados ao local/trecho selecionado.
                                    </p>
                                    <div className="grid gap-3 md:grid-cols-3">
                                        <div className="rounded-md border p-3 space-y-2">
                                            <p className="text-xs font-semibold text-foreground">
                                                Exibição de custos
                                            </p>
                                            <button
                                                type="button"
                                                className={cn(
                                                    toggleBtnClass,
                                                    "w-full",
                                                    showCostsOnPrint
                                                        ? "border-primary bg-primary text-primary-foreground"
                                                        : "border-border bg-background text-foreground hover:bg-muted"
                                                )}
                                                onClick={async () => {
                                                    const checked = !showCostsOnPrint;
                                                    setShowCostsOnPrint(checked);
                                                    const ok = await saveCommercialConfig({
                                                        show_costs_on_print: checked,
                                                    });
                                                    if (!ok) setShowCostsOnPrint(!checked);
                                                }}
                                                disabled={!selected}
                                            >
                                                {showCostsOnPrint ? "Custos visíveis" : "Exibir custos"}
                                            </button>
                                            {showCostsOnPrint && (
                                                <div className="grid grid-cols-1 gap-2 pt-1">
                                                    <button
                                                        type="button"
                                                        className={cn(
                                                            toggleBtnClass,
                                                            costsDisplayMode === "location"
                                                                ? "border-primary bg-primary/10 text-primary"
                                                                : "border-border bg-background text-foreground hover:bg-muted"
                                                        )}
                                                        onClick={async () => {
                                                            setCostsDisplayMode("location");
                                                            const ok = await saveCommercialConfig({
                                                                costs_display_mode: "location",
                                                            });
                                                            if (!ok) setCostsDisplayMode("section");
                                                        }}
                                                        disabled={!selected}
                                                    >
                                                        Por local
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={cn(
                                                            toggleBtnClass,
                                                            costsDisplayMode === "section"
                                                                ? "border-primary bg-primary/10 text-primary"
                                                                : "border-border bg-background text-foreground hover:bg-muted"
                                                        )}
                                                        onClick={async () => {
                                                            setCostsDisplayMode("section");
                                                            const ok = await saveCommercialConfig({
                                                                costs_display_mode: "section",
                                                            });
                                                            if (!ok) setCostsDisplayMode("section");
                                                        }}
                                                        disabled={!selected}
                                                    >
                                                        Por trecho
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={cn(
                                                            toggleBtnClass,
                                                            costsDisplayMode === "general"
                                                                ? "border-primary bg-primary/10 text-primary"
                                                                : "border-border bg-background text-foreground hover:bg-muted"
                                                        )}
                                                        onClick={async () => {
                                                            setCostsDisplayMode("general");
                                                            const ok = await saveCommercialConfig({
                                                                costs_display_mode: "general",
                                                            });
                                                            if (!ok) setCostsDisplayMode("section");
                                                        }}
                                                        disabled={!selected}
                                                    >
                                                        Geral
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="rounded-md border p-3 space-y-2">
                                            <p className="text-xs font-semibold text-foreground">
                                                Ajuste de preço
                                            </p>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    className={cn(
                                                        toggleBtnClass,
                                                        "w-full",
                                                        priceAdjustmentEnabled
                                                            ? "border-primary bg-primary text-primary-foreground"
                                                            : "border-border bg-background text-foreground hover:bg-muted"
                                                    )}
                                                    onClick={async () => {
                                                        const checked = !priceAdjustmentEnabled;
                                                        setPriceAdjustmentEnabled(checked);
                                                        const ok = await saveCommercialConfig({
                                                            price_adjustment_enabled: checked,
                                                        });
                                                        if (!ok) setPriceAdjustmentEnabled(!checked);
                                                    }}
                                                    disabled={!selected}
                                                >
                                                    {priceAdjustmentEnabled ? "Ajuste ativo" : "Ativar ajuste"}
                                                </button>
                                                <div className="grid w-full grid-cols-2 gap-2">
                                                    <button
                                                        type="button"
                                                        className={cn(
                                                            toggleBtnClass,
                                                            priceAdjustmentInputMode === "percent"
                                                                ? "border-primary bg-primary/10 text-primary"
                                                                : "border-border bg-background text-foreground hover:bg-muted"
                                                        )}
                                                        onClick={async () => {
                                                            setPriceAdjustmentInputMode("percent");
                                                            const ok = await saveCommercialConfig({
                                                                price_adjustment_input_mode: "percent",
                                                            });
                                                            if (!ok) setPriceAdjustmentInputMode("fixed");
                                                        }}
                                                        disabled={!priceAdjustmentEnabled || !selected}
                                                    >
                                                        %
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={cn(
                                                            toggleBtnClass,
                                                            priceAdjustmentInputMode === "fixed"
                                                                ? "border-primary bg-primary/10 text-primary"
                                                                : "border-border bg-background text-foreground hover:bg-muted"
                                                        )}
                                                        onClick={async () => {
                                                            setPriceAdjustmentInputMode("fixed");
                                                            const ok = await saveCommercialConfig({
                                                                price_adjustment_input_mode: "fixed",
                                                            });
                                                            if (!ok) setPriceAdjustmentInputMode("percent");
                                                        }}
                                                        disabled={!priceAdjustmentEnabled || !selected}
                                                    >
                                                        R$
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-md border p-3 space-y-2">
                                            <p className="text-xs font-semibold text-foreground">
                                                Montagem
                                            </p>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className="grid w-full grid-cols-3 gap-2">
                                                    <button
                                                        type="button"
                                                        className={cn(
                                                            toggleBtnClass,
                                                            assemblyMode === "percent"
                                                                ? "border-primary bg-primary/10 text-primary"
                                                                : "border-border bg-background text-foreground hover:bg-muted"
                                                        )}
                                                        onClick={async () => {
                                                            if (!selected?.id) return;
                                                            setAssemblyMode("percent");
                                                            await saveCommercialConfig({
                                                                assembly_mode: "percent",
                                                            });
                                                        }}
                                                        disabled={!selected?.id}
                                                    >
                                                        %
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={cn(
                                                            toggleBtnClass,
                                                            assemblyMode === "fixed"
                                                                ? "border-primary bg-primary/10 text-primary"
                                                                : "border-border bg-background text-foreground hover:bg-muted"
                                                        )}
                                                        onClick={async () => {
                                                            if (!selected?.id) return;
                                                            setAssemblyMode("fixed");
                                                            await saveCommercialConfig({
                                                                assembly_mode: "fixed",
                                                            });
                                                        }}
                                                        disabled={!selected?.id}
                                                    >
                                                        R$
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={cn(
                                                            toggleBtnClass,
                                                            assemblyMode === "manual"
                                                                ? "border-primary bg-primary/10 text-primary"
                                                                : "border-border bg-background text-foreground hover:bg-muted"
                                                        )}
                                                        onClick={async () => {
                                                            if (!selected?.id) return;
                                                            setAssemblyMode("manual");
                                                            await saveCommercialConfig({
                                                                assembly_mode: "manual",
                                                            });
                                                        }}
                                                        disabled={!selected?.id}
                                                    >
                                                        Manual
                                                    </button>
                                                </div>
                                                <input
                                                    type="number"
                                                    value={assemblyValue}
                                                    onChange={(e) => setAssemblyValue(Number(e.target.value))}
                                                    onBlur={async () => {
                                                        if (!selected?.id || assemblyMode === "manual") return;
                                                        await saveCommercialConfig({
                                                            assembly_mode: assemblyMode,
                                                            assembly_value: Number.isFinite(assemblyValue)
                                                                ? assemblyValue
                                                                : 0,
                                                        });
                                                    }}
                                                    disabled={!selected?.id || assemblyMode === "manual"}
                                                    className="h-8 w-full rounded-md border px-2 text-xs"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
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
                            quoteMarkupPercent={quoteMarkupPercent}
                            quoteDiscountPercent={quoteDiscountPercent}
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
                            assemblyMode={assemblyMode}
                            assemblyValue={assemblyValue}
                            priceAdjustmentEnabled={priceAdjustmentEnabled}
                            priceAdjustmentInputMode={priceAdjustmentInputMode}
                            quoteMarkupPercent={quoteMarkupPercent}
                            quoteDiscountPercent={quoteDiscountPercent}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

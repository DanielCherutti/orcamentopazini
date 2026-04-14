"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
    ScopePricingItem,
} from "@/lib/budgets/scope-pricing";
import {
    computeLocationScopeTotal,
} from "@/lib/budgets/scope-pricing";
import {
    updateLocationAction,
    updateSectionAction,
} from "@/actions/budget-hierarchy-scope-structure-actions";
import {
    clearScopeItemPriceAdjustmentsAction,
    getBudgetItemsGroupedByBudgetIdLightAction,
} from "@/actions/budget-hierarchy-section-items-actions";
import { listProductGroupsAction, type ProductGroup } from "@/actions/product-group-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { ScopeFiguresProvider } from "./scope-figures-context";
import { prefetchScopeSectionPayloadDebounced } from "@/lib/budgets/scope-section-payload-cache";
import type { BudgetItem } from "@/types/budget-types";
import { budgetItemsFromGroupedBySectionId } from "@/lib/budgets/budget-section-items-grouped";

export type { BudgetScopeProps, Selection } from "./budget-scope-types";

function mapBudgetItemToScopePricingWithSection(
    it: BudgetItem,
    sectionId: string
): ScopePricingItem & { section_id: string } {
    const mode = it.price_adjustment_mode;
    return {
        id: it.id,
        section_id: sectionId,
        quantity: it.quantity,
        unit_price: it.unit_price,
        labor_cost: it.labor_cost,
        price_adjustment_mode:
            mode === "percent" || mode === "fixed" ? mode : null,
        price_adjustment_value: it.price_adjustment_value ?? 0,
        observation_extra_value: it.observation_extra_value ?? 0,
        assembly_manual_value: it.assembly_manual_value ?? 0,
    };
}

export function BudgetScope({
    budgetId,
    isReadOnly = false,
    quoteMarkupPercent = 0,
    quoteDiscountPercent = 0,
}: BudgetScopeProps) {
    const [locations, setLocations] = useState<ScopeLocation[]>([]);
    /** Incrementa após cada refresh para forçar recálculo dos totais por local no índice. */
    const [scopeDataVersion, setScopeDataVersion] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Selection | null>(null);
    const [scopeNumber, setScopeNumber] = useState<string>("");
    const [locationTotalsById, setLocationTotalsById] = useState<Record<string, number>>({});
    const [locationTotalsLoading, setLocationTotalsLoading] = useState(false);
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
        const locResult = await getLocationsAction(budgetId);
        if (locResult.success && locResult.data) {
            setLocations(locResult.data);
            setScopeDataVersion((v) => v + 1);
        }
    }, [budgetId]);

    const loadScopeNumber = useCallback(async () => {
        const { getCompositorTreeSnapshotAction } = await import(
            "@/actions/budget-compositor-tree-actions"
        );
        const { buildTree } = await import("@/types/budget-compositor-types");
        const res = await getCompositorTreeSnapshotAction(budgetId);
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
        } else {
            setScopeNumber("");
        }
    }, [budgetId]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        void loadLocations().finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [loadLocations]);

    useEffect(() => {
        void loadScopeNumber();
    }, [loadScopeNumber]);

    const totalsCacheRef = useRef<Map<string, Record<string, number>>>(new Map());
    const totalsCacheKey = useMemo(
        () =>
            `${scopeDataVersion}|${locations
                .map(
                    (loc) =>
                        `${loc.id}:${loc.assembly_mode ?? "percent"}:${loc.assembly_value ?? 0}:${loc.sections
                            .map((sec) => `${sec.id}:${sec.assembly_mode ?? ""}:${sec.assembly_value ?? ""}`)
                            .join(",")}`
                )
                .join("|")}`,
        [locations, scopeDataVersion]
    );

    useEffect(() => {
        totalsCacheRef.current.clear();
    }, [budgetId]);

    useEffect(() => {
        let cancelled = false;
        if (locations.length === 0) {
            setLocationTotalsById({});
            setLocationTotalsLoading(false);
            return;
        }

        const cached = totalsCacheRef.current.get(totalsCacheKey);
        if (cached) {
            setLocationTotalsById(cached);
            setLocationTotalsLoading(false);
            return;
        }

        setLocationTotalsLoading(true);
        void (async () => {
            const grouped = await getBudgetItemsGroupedByBudgetIdLightAction(budgetId);
            if (cancelled) return;

            if (!grouped.success || !grouped.data) {
                setLocationTotalsById({});
                return;
            }

            const nextTotals: Record<string, number> = {};
            for (const loc of locations) {
                const itemsWithSection: Array<ScopePricingItem & { section_id: string }> = [];
                for (const sec of loc.sections) {
                    for (const it of budgetItemsFromGroupedBySectionId(grouped.data, sec.id)) {
                        itemsWithSection.push(mapBudgetItemToScopePricingWithSection(it, sec.id));
                    }
                }
                nextTotals[loc.id] = computeLocationScopeTotal({
                    location: {
                        assembly_mode: loc.assembly_mode,
                        assembly_value: loc.assembly_value,
                    },
                    sections: loc.sections,
                    items: itemsWithSection,
                });
            }
            if (cancelled) return;
            totalsCacheRef.current.set(totalsCacheKey, nextTotals);
            setLocationTotalsById(nextTotals);
        })().finally(() => {
            if (!cancelled) setLocationTotalsLoading(false);
        });

        return () => {
            cancelled = true;
        };
    }, [budgetId, locations, totalsCacheKey]);

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

    const runClearItemPriceAdjustments = useCallback(async () => {
        if (!selected) return { success: false as const, clearedCount: 0 };
        return clearScopeItemPriceAdjustmentsAction(
            budgetId,
            selected.type === "location"
                ? { type: "location", locationId: selected.id }
                : { type: "section", sectionId: selected.id }
        );
    }, [budgetId, selected]);

    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [productGroups, setProductGroups] = useState<ProductGroup[] | undefined>(undefined);

    useEffect(() => {
        void listProductGroupsAction().then((r) => {
            if (r.success && r.data) setProductGroups(r.data);
        });
    }, []);

    if (loading) {
        return (
            <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <ScopeFiguresProvider budgetId={budgetId} scopeDataVersion={scopeDataVersion}>
        <div className="flex flex-1 min-h-0 overflow-hidden">
            {sidebarOpen && (
                <ScopeSidebar
                    key={budgetId}
                    budgetId={budgetId}
                    locations={locations}
                    locationTotalsById={locationTotalsById}
                    locationTotalsLoading={locationTotalsLoading}
                    quoteMarkupPercent={quoteMarkupPercent}
                    quoteDiscountPercent={quoteDiscountPercent}
                    selected={selected}
                    onSelect={setSelected}
                    onRefresh={loadLocations}
                    isReadOnly={isReadOnly}
                    scopeNumber={scopeNumber}
                    onPrefetchSection={(sectionId) => {
                        prefetchScopeSectionPayloadDebounced(scopeDataVersion, sectionId);
                    }}
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
                                                        if (!selected) return;
                                                        const enabling = !priceAdjustmentEnabled;
                                                        if (!enabling) {
                                                            const cleared = await runClearItemPriceAdjustments();
                                                            if (!cleared.success) {
                                                                toast.error(
                                                                    cleared.error ||
                                                                        "Erro ao zerar ajustes dos itens"
                                                                );
                                                                return;
                                                            }
                                                            const ok = await saveCommercialConfig({
                                                                price_adjustment_enabled: false,
                                                            });
                                                            if (!ok) {
                                                                toast.error(
                                                                    "Não foi possível desativar o ajuste de preço."
                                                                );
                                                                await loadLocations();
                                                                return;
                                                            }
                                                            setPriceAdjustmentEnabled(false);
                                                            await loadLocations();
                                                            if ((cleared.clearedCount ?? 0) > 0) {
                                                                toast.success(
                                                                    `Ajustes zerados em ${cleared.clearedCount} item(ns).`
                                                                );
                                                            }
                                                            return;
                                                        }
                                                        setPriceAdjustmentEnabled(true);
                                                        const ok = await saveCommercialConfig({
                                                            price_adjustment_enabled: true,
                                                        });
                                                        if (!ok) setPriceAdjustmentEnabled(false);
                                                        else await loadLocations();
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
                                                <button
                                                    type="button"
                                                    className={cn(
                                                        toggleBtnClass,
                                                        "w-full border-dashed text-muted-foreground hover:text-foreground"
                                                    )}
                                                    onClick={async () => {
                                                        if (!selected || !priceAdjustmentEnabled) return;
                                                        const res = await runClearItemPriceAdjustments();
                                                        if (!res.success) {
                                                            toast.error(
                                                                res.error || "Erro ao zerar ajustes dos itens"
                                                            );
                                                            return;
                                                        }
                                                        await loadLocations();
                                                        if ((res.clearedCount ?? 0) > 0) {
                                                            toast.success(
                                                                `Ajustes zerados em ${res.clearedCount} item(ns).`
                                                            );
                                                        } else {
                                                            toast.success(
                                                                "Nenhum item tinha valor de ajuste de preço."
                                                            );
                                                        }
                                                    }}
                                                    disabled={!selected || !priceAdjustmentEnabled}
                                                >
                                                    Zerar ajustes dos itens
                                                </button>
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
                            scopeDataVersion={scopeDataVersion}
                            priceAdjustmentEnabled={priceAdjustmentEnabled}
                            priceAdjustmentInputMode={priceAdjustmentInputMode}
                            quoteMarkupPercent={quoteMarkupPercent}
                            quoteDiscountPercent={quoteDiscountPercent}
                            productGroups={productGroups}
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
                            scopeDataVersion={scopeDataVersion}
                            assemblyMode={assemblyMode}
                            assemblyValue={assemblyValue}
                            priceAdjustmentEnabled={priceAdjustmentEnabled}
                            priceAdjustmentInputMode={priceAdjustmentInputMode}
                            quoteMarkupPercent={quoteMarkupPercent}
                            quoteDiscountPercent={quoteDiscountPercent}
                            productGroups={productGroups}
                        />
                    )}
                </div>
            </div>
        </div>
        </ScopeFiguresProvider>
    );
}

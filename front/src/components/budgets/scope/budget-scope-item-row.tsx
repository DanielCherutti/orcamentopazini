"use client";

import { useState, useEffect, useRef } from "react";
import type { HTMLAttributes } from "react";
import { GripVertical, MessageSquareText, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { BudgetItem } from "@/types/budget-types";
import {
    updateItemQuantityAction,
    deleteItemAction,
    updateItemCommercialSettingsAction,
} from "@/actions/budget-hierarchy-section-items-actions";
import { formatCurrency } from "./budget-scope-utils";
import {
    computeItemAdjustmentValue,
    computeItemBaseTotal,
    computeItemSubtotal,
    type LocationAssemblyMode,
    type PriceAdjustmentMode,
} from "@/lib/budgets/scope-pricing";

export function ScopeItemRow({
    item,
    budgetId,
    isReadOnly,
    onRefresh,
    indented = false,
    dragHandleProps,
    assemblyMode = "percent",
    assemblyByItemId = {},
    priceAdjustmentEnabled,
    priceAdjustmentInputMode,
}: {
    item: BudgetItem;
    budgetId: string;
    isReadOnly: boolean;
    onRefresh: () => void;
    indented?: boolean;
    dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
    assemblyMode?: LocationAssemblyMode;
    assemblyByItemId?: Record<string, number>;
    priceAdjustmentEnabled: boolean;
    priceAdjustmentInputMode: PriceAdjustmentMode;
}) {
    const [qty, setQty] = useState(item.quantity);
    const [observationOpen, setObservationOpen] = useState(false);
    const [observationText, setObservationText] = useState(
        String((item as Record<string, unknown>).observation_text ?? "")
    );
    const [observationShowOnPrint, setObservationShowOnPrint] = useState(
        Boolean((item as Record<string, unknown>).observation_show_on_print)
    );
    const [observationExtraValue, setObservationExtraValue] = useState(
        Number((item as Record<string, unknown>).observation_extra_value ?? 0)
    );
    const [priceAdjustmentValue, setPriceAdjustmentValue] = useState(
        Number((item as Record<string, unknown>).price_adjustment_value ?? 0)
    );
    const [assemblyManualValue, setAssemblyManualValue] = useState(
        Number((item as Record<string, unknown>).assembly_manual_value ?? 0)
    );
    const qtyDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        // Sincroniza quantidade quando o item vindo do servidor muda (ex.: após refresh)
        // eslint-disable-next-line react-hooks/set-state-in-effect -- derivado de prop externa
        setQty(item.quantity);
        setObservationText(String((item as Record<string, unknown>).observation_text ?? ""));
        setObservationShowOnPrint(Boolean((item as Record<string, unknown>).observation_show_on_print));
        setObservationExtraValue(Number((item as Record<string, unknown>).observation_extra_value ?? 0));
        setPriceAdjustmentValue(Number((item as Record<string, unknown>).price_adjustment_value ?? 0));
        setAssemblyManualValue(Number((item as Record<string, unknown>).assembly_manual_value ?? 0));
        const hasObs =
            String((item as Record<string, unknown>).observation_text ?? "").trim().length > 0 ||
            Number((item as Record<string, unknown>).observation_extra_value ?? 0) !== 0;
        setObservationOpen(hasObs);
    }, [item]);

    const productData = (item as unknown as Record<string, unknown>).product_data as
        | Record<string, unknown>
        | undefined;
    const productIdObj = (item as Record<string, unknown>).product_id;
    const productFallback =
        typeof productIdObj === "object" && productIdObj !== null
            ? (productIdObj as Record<string, unknown>)
            : undefined;
    const productName = ((item as Record<string, unknown>).product_name as string | undefined) ??
        (productData?.description ??
            productData?.name ??
            productData?.code ??
            productFallback?.description ??
            productFallback?.name ??
            productFallback?.code) as string | undefined;
    const productUnit = (
        (item as Record<string, unknown>).product_unit as string | undefined ??
        (productData?.unit as string | undefined) ??
        (productFallback?.unit as string | undefined) ??
        ""
    ).trim();
    const unitPrice = Number(item.unit_price) || 0;
    const laborCost = Number(item.labor_cost) || 0;
    const baseTotal = computeItemBaseTotal({
        quantity: qty,
        unit_price: unitPrice,
        labor_cost: laborCost,
    });
    const adjustmentValue = computeItemAdjustmentValue({
        quantity: qty,
        unit_price: unitPrice,
        labor_cost: laborCost,
        price_adjustment_mode: priceAdjustmentInputMode,
        price_adjustment_value: priceAdjustmentValue,
    });
    const subtotal = computeItemSubtotal({
        quantity: qty,
        unit_price: unitPrice,
        labor_cost: laborCost,
        price_adjustment_mode: priceAdjustmentInputMode,
        price_adjustment_value: priceAdjustmentValue,
        observation_extra_value: observationExtraValue,
    });
    const assemblyExtra =
        assemblyMode === "manual"
            ? Number(assemblyManualValue || 0)
            : Number(item.id ? assemblyByItemId[item.id] ?? 0 : 0);
    const total = subtotal + assemblyExtra;

    const handleQtyChange = (val: number) => {
        if (val < 1) return;
        setQty(val);
        if (qtyDebounce.current) clearTimeout(qtyDebounce.current);
        qtyDebounce.current = setTimeout(() => {
            updateItemQuantityAction(item.id!, budgetId, val).then(onRefresh);
        }, 600);
    };

    const handleDelete = async () => {
        const result = await deleteItemAction(item.id!, budgetId);
        if (!result.success) toast.error(result.error || "Erro ao remover");
        else onRefresh();
    };

    const handleSaveCommercial = async (patch: {
        observation_text?: string;
        observation_show_on_print?: boolean;
        observation_extra_value?: number;
        price_adjustment_mode?: PriceAdjustmentMode | null;
        price_adjustment_value?: number;
        assembly_manual_value?: number;
    }) => {
        const result = await updateItemCommercialSettingsAction(item.id!, budgetId, patch);
        if (!result.success) {
            toast.error(result.error || "Erro ao salvar ajuste do item");
            return;
        }
        onRefresh();
    };

    return (
        <div className={cn("space-y-2", indented && "ml-4")}>
            <div
                className={cn(
                    "grid grid-cols-12 gap-2 items-center px-2 py-1.5 rounded-md border bg-background text-sm"
                )}
            >
                <div className="col-span-3 flex items-center gap-1 min-w-0">
                {dragHandleProps && (
                    <button
                        type="button"
                        {...dragHandleProps}
                        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0 touch-none"
                    >
                        <GripVertical className="h-3.5 w-3.5" />
                    </button>
                )}
                <span className="truncate text-xs">{productName || "Produto"}</span>
                </div>
                <div className="col-span-2 flex items-center justify-center gap-1 min-w-0">
                {isReadOnly ? (
                    <span className="text-xs tabular-nums">
                        {qty}
                        {productUnit ? (
                            <span className="text-muted-foreground font-normal ml-1">{productUnit}</span>
                        ) : null}
                    </span>
                ) : (
                    <>
                        <input
                            type="number"
                            min={1}
                            value={qty}
                            onChange={(e) => handleQtyChange(Number(e.target.value))}
                            className="w-11 shrink-0 text-center border rounded text-xs h-6"
                        />
                        {productUnit ? (
                            <span
                                className="text-[10px] sm:text-xs text-muted-foreground shrink-0 max-w-[5rem] truncate leading-tight"
                                title={productUnit}
                            >
                                {productUnit}
                            </span>
                        ) : null}
                    </>
                )}
                </div>
                <div className="col-span-1 text-right text-xs text-muted-foreground">
                    {formatCurrency(unitPrice)}
                </div>
                <div className="col-span-2 flex items-center justify-end gap-1">
                    {!isReadOnly && (
                        <input
                            type="number"
                            className="h-6 w-20 rounded border px-1 text-right text-xs"
                            value={priceAdjustmentValue}
                            onChange={(e) => setPriceAdjustmentValue(Number(e.target.value))}
                            onBlur={() =>
                                void handleSaveCommercial({
                                    price_adjustment_mode: priceAdjustmentInputMode,
                                    price_adjustment_value: Number.isFinite(priceAdjustmentValue)
                                        ? priceAdjustmentValue
                                        : 0,
                                })
                            }
                            title={
                                priceAdjustmentInputMode === "percent"
                                    ? "Ajuste de preço em %"
                                    : "Ajuste de preço em R$"
                            }
                            disabled={!priceAdjustmentEnabled}
                        />
                    )}
                    {isReadOnly && (
                        <span className="text-xs text-muted-foreground">
                            {formatCurrency(adjustmentValue)}
                        </span>
                    )}
                </div>
                <div className="col-span-1 text-right text-xs text-muted-foreground">
                    {formatCurrency(laborCost)}
                </div>
                <div className="col-span-1 text-right text-xs font-medium">{formatCurrency(total)}</div>
                <div className="col-span-2 flex items-center justify-end gap-1">
                    {!isReadOnly && (
                        <button
                            type="button"
                            className="h-7 rounded border px-2 text-[11px] text-primary"
                            onClick={() => setObservationOpen((v) => !v)}
                        >
                            <span className="inline-flex items-center gap-1">
                                <MessageSquareText className="h-3.5 w-3.5" />
                                Observação
                            </span>
                        </button>
                    )}
                    {!isReadOnly && (
                    <button
                        type="button"
                        onClick={handleDelete}
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    )}
                </div>
            </div>
            {observationOpen && (
                <div className="rounded-md border border-dashed bg-muted/20 p-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <input
                            type="text"
                            className="h-8 rounded border bg-background px-2 text-xs sm:col-span-2"
                            placeholder="Observação do item"
                            value={observationText}
                            onChange={(e) => setObservationText(e.target.value)}
                            onBlur={() =>
                                void handleSaveCommercial({ observation_text: observationText.trim() })
                            }
                            disabled={isReadOnly}
                        />
                        <input
                            type="number"
                            className="h-8 rounded border bg-background px-2 text-xs"
                            placeholder="Acréscimo (R$)"
                            value={observationExtraValue}
                            onChange={(e) => setObservationExtraValue(Number(e.target.value))}
                            onBlur={() =>
                                void handleSaveCommercial({
                                    observation_extra_value: Number.isFinite(observationExtraValue)
                                        ? observationExtraValue
                                        : 0,
                                })
                            }
                            disabled={isReadOnly}
                        />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={observationShowOnPrint}
                                onChange={(e) => {
                                    const checked = e.target.checked;
                                    setObservationShowOnPrint(checked);
                                    void handleSaveCommercial({ observation_show_on_print: checked });
                                }}
                                disabled={isReadOnly}
                            />
                            Exibir na impressão
                        </label>
                        {assemblyMode === "manual" && (
                            <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                <span>Montagem manual</span>
                                <input
                                    type="number"
                                    className="h-7 w-24 rounded border bg-background px-2 text-xs"
                                    value={assemblyManualValue}
                                    onChange={(e) => setAssemblyManualValue(Number(e.target.value))}
                                    onBlur={() =>
                                        void handleSaveCommercial({
                                            assembly_manual_value: Number.isFinite(assemblyManualValue)
                                                ? assemblyManualValue
                                                : 0,
                                        })
                                    }
                                    disabled={isReadOnly}
                                />
                            </div>
                        )}
                        {assemblyMode !== "manual" && (
                            <span className="text-[11px] text-muted-foreground">
                                Rateio montagem: {formatCurrency(assemblyExtra)}
                            </span>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                            Base: {formatCurrency(baseTotal)} | Ajuste: {formatCurrency(adjustmentValue)}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

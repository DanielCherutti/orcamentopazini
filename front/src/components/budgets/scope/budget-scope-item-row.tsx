"use client";

import { useState, useEffect, useRef, useCallback, memo } from "react";
import type { HTMLAttributes } from "react";
import { GripVertical, MessageSquareText, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { BudgetItem } from "@/types/budget-types";
import {
    updateItemQuantityAction,
    deleteItemAction,
    updateItemCommercialSettingsAction,
    updateItemGroupInSectionAction,
    type SectionItemGroupTarget,
} from "@/actions/budget-hierarchy-section-items-actions";
import { QuantityTextInput } from "@/components/budgets/quantity-text-input";
import { EditTemporaryProductScopeDialog } from "@/components/budgets/scope/add-temporary-product-scope-dialog";
import { SignedNumberInput } from "@/components/budgets/scope/signed-number-input";
import { Checkbox } from "@/components/ui/checkbox";
import { TruncatedTextTooltip } from "@/components/ui/tooltip";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { formatCurrency, NO_GROUP_VALUE } from "./budget-scope-utils";
import {
    applyQuoteCommercialFactor,
    computeItemAdjustmentValue,
    computeItemBaseTotal,
    computeItemSubtotal,
    type LocationAssemblyMode,
    type PriceAdjustmentMode,
} from "@/lib/budgets/scope-pricing";

export type ScopeItemGroupDestination = {
    value: string;
    label: string;
    target: SectionItemGroupTarget;
};

function ScopeItemRowInner({
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
    quoteMarkupPercent = 0,
    quoteDiscountPercent = 0,
    quoteAssemblyMarkupPercent = quoteMarkupPercent,
    quoteAssemblyDiscountPercent = quoteDiscountPercent,
    selectionEnabled = false,
    selected = false,
    onSelectionChange,
    groupDestinations = [],
    currentGroupValue = NO_GROUP_VALUE,
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
    quoteMarkupPercent?: number;
    quoteDiscountPercent?: number;
    quoteAssemblyMarkupPercent?: number;
    quoteAssemblyDiscountPercent?: number;
    /** Caixas para remoção em lote (lista editável do escopo). */
    selectionEnabled?: boolean;
    selected?: boolean;
    onSelectionChange?: (checked: boolean) => void;
    groupDestinations?: ScopeItemGroupDestination[];
    currentGroupValue?: string;
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
    const [laborShowOnPrint, setLaborShowOnPrint] = useState(
        Boolean((item as Record<string, unknown>).labor_show_on_print)
    );
    const [groupSaving, setGroupSaving] = useState(false);
    const [temporaryProductEditOpen, setTemporaryProductEditOpen] = useState(false);
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
        setLaborShowOnPrint(Boolean((item as Record<string, unknown>).labor_show_on_print));
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
    const productCode = String(
        (item as Record<string, unknown>).product_code ??
            productData?.code ??
            productFallback?.code ??
            "—"
    ).trim() || "—";
    const productNcm = String(
        (item as Record<string, unknown>).product_ncm ??
            productData?.ncm ??
            productFallback?.ncm ??
            "—"
    ).trim() || "—";
    const productUnit = (
        (item as Record<string, unknown>).product_unit as string | undefined ??
        (productData?.unit as string | undefined) ??
        (productFallback?.unit as string | undefined) ??
        ""
    ).trim();
    const isTemporaryProduct = Boolean(productData?.is_temporary);
    const unitPrice = Number(item.unit_price) || 0;
    const laborCost = Number(item.labor_cost) || 0;
    const hasProductLabor = laborCost > 0;
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
    const assemblyUnitValue = qty > 0 ? assemblyExtra / qty : 0;
    /** MO unit.: em montagem manual = montagem manual por unidade (total da linha / qtd). */
    const moUnitValue = assemblyUnitValue;
    const manualMoPerUnit = qty > 0 ? assemblyManualValue / qty : assemblyManualValue;
    const total =
        applyQuoteCommercialFactor(subtotal, quoteMarkupPercent, quoteDiscountPercent) +
        applyQuoteCommercialFactor(
            assemblyExtra,
            quoteAssemblyMarkupPercent,
            quoteAssemblyDiscountPercent,
        );

    const displayEquipmentMoney = useCallback(
        (value: number) =>
            formatCurrency(
                applyQuoteCommercialFactor(value, quoteMarkupPercent ?? 0, quoteDiscountPercent ?? 0)
            ),
        [quoteMarkupPercent, quoteDiscountPercent]
    );
    const displayAssemblyMoney = useCallback(
        (value: number) =>
            formatCurrency(
                applyQuoteCommercialFactor(
                    value,
                    quoteAssemblyMarkupPercent,
                    quoteAssemblyDiscountPercent,
                ),
            ),
        [quoteAssemblyDiscountPercent, quoteAssemblyMarkupPercent],
    );

    const handleQtyChange = (val: number) => {
        if (!Number.isFinite(val) || val <= 0) return;
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

    const handleGroupChange = async (value: string) => {
        const destination = groupDestinations.find((option) => option.value === value);
        const target = value === NO_GROUP_VALUE ? null : destination?.target;
        if (value !== NO_GROUP_VALUE && !target) return;
        setGroupSaving(true);
        const result = await updateItemGroupInSectionAction(item.id!, budgetId, target ?? null);
        setGroupSaving(false);
        if (!result.success) toast.error(result.error || "Erro ao mover produto entre grupos");
        else onRefresh();
    };

    const handleSaveCommercial = async (patch: {
        observation_text?: string;
        observation_show_on_print?: boolean;
        observation_extra_value?: number;
        price_adjustment_mode?: PriceAdjustmentMode | null;
        price_adjustment_value?: number;
        assembly_manual_value?: number;
        labor_show_on_print?: boolean;
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
                    "grid grid-cols-[repeat(14,minmax(0,1fr))] gap-2 items-center px-2 py-1.5 rounded-md border bg-background text-sm"
                )}
            >
                <div className="col-span-1 truncate text-[11px] font-mono" title={productCode}>
                    {productCode}
                </div>
                <div className="col-span-2 flex items-center gap-1.5 min-w-0">
                    {selectionEnabled && (
                        <Checkbox
                            checked={selected}
                            onCheckedChange={(c) => onSelectionChange?.(c === true)}
                            className="shrink-0"
                            aria-label="Selecionar produto"
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                        />
                    )}
                    {dragHandleProps && (
                        <button
                            type="button"
                            {...dragHandleProps}
                            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0 touch-none"
                        >
                            <GripVertical className="h-3.5 w-3.5" />
                        </button>
                    )}
                    <TruncatedTextTooltip
                        text={productName || "Produto"}
                        className="text-xs"
                    />
                    {isTemporaryProduct ? (
                        <>
                            <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                Temp.
                            </span>
                            {!isReadOnly ? (
                                <button
                                    type="button"
                                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                    onClick={() => setTemporaryProductEditOpen(true)}
                                    aria-label="Editar produto temporário"
                                    title="Editar produto temporário"
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                </button>
                            ) : null}
                        </>
                    ) : null}
                </div>
                <div className="col-span-1 truncate text-[11px] font-mono" title={productNcm}>
                    {productNcm}
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
                        <QuantityTextInput
                            value={qty}
                            onValueChange={handleQtyChange}
                            className="w-11 shrink-0 text-center border border-input rounded text-xs h-6 bg-background"
                            aria-label="Quantidade"
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
                    {displayEquipmentMoney(unitPrice)}
                </div>
                <div className="col-span-3 flex items-center justify-end gap-1">
                    {!isReadOnly && groupDestinations.length > 0 ? (
                        <Select
                            value={currentGroupValue}
                            onValueChange={(value) => void handleGroupChange(value)}
                            disabled={groupSaving}
                        >
                            <SelectTrigger
                                className="h-7 min-w-0 flex-1 border-dashed px-2 text-[10px]"
                                aria-label="Mover produto para grupo"
                                title="Mover produto para dentro ou para fora de um grupo"
                            >
                                <SelectValue placeholder="Grupo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NO_GROUP_VALUE}>Sem grupo</SelectItem>
                                {groupDestinations.map((destination) => (
                                    <SelectItem key={destination.value} value={destination.value}>
                                        {destination.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : null}
                    {!isReadOnly && (
                        <SignedNumberInput
                            className="h-6 w-20 rounded border px-1 text-right text-xs"
                            value={priceAdjustmentValue}
                            onValueCommit={(value) => {
                                setPriceAdjustmentValue(value);
                                return handleSaveCommercial({
                                    price_adjustment_mode: priceAdjustmentInputMode,
                                    price_adjustment_value: value,
                                });
                            }}
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
                            {displayEquipmentMoney(adjustmentValue)}
                        </span>
                    )}
                </div>
                <div className="col-span-1 flex items-center justify-end min-w-0">
                    {!isReadOnly && assemblyMode === "manual" ? (
                        <input
                            type="number"
                            className="h-6 w-full max-w-[5.5rem] rounded border border-input bg-background px-1 text-right text-xs tabular-nums"
                            value={Number.isFinite(manualMoPerUnit) ? manualMoPerUnit : 0}
                            onChange={(e) => {
                                const per = Number(e.target.value);
                                if (!Number.isFinite(per)) return;
                                setAssemblyManualValue(qty > 0 ? per * qty : per);
                            }}
                            onBlur={() =>
                                void handleSaveCommercial({
                                    assembly_manual_value: Number.isFinite(assemblyManualValue)
                                        ? assemblyManualValue
                                        : 0,
                                })
                            }
                            title="Montagem manual por unidade (o total da linha é este valor × quantidade)"
                            aria-label="Montagem manual por unidade"
                        />
                    ) : (
                        <span className="text-right text-xs text-muted-foreground tabular-nums w-full">
                            {displayAssemblyMoney(moUnitValue)}
                        </span>
                    )}
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
                        {hasProductLabor ? (
                            <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                <input
                                    type="checkbox"
                                    checked={laborShowOnPrint}
                                    onChange={(e) => {
                                        const checked = e.target.checked;
                                        setLaborShowOnPrint(checked);
                                        void handleSaveCommercial({ labor_show_on_print: checked });
                                    }}
                                    disabled={isReadOnly}
                                />
                                Exibir mão de obra na impressão (PDF)
                            </label>
                        ) : null}
                        {assemblyMode !== "manual" && (
                            <span className="text-[11px] text-muted-foreground">
                                Rateio montagem: {displayAssemblyMoney(assemblyExtra)}
                            </span>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                            Base: {displayEquipmentMoney(baseTotal)} | Ajuste: {displayEquipmentMoney(adjustmentValue)}
                        </span>
                    </div>
                </div>
            )}
            {isTemporaryProduct && temporaryProductEditOpen ? (
                <EditTemporaryProductScopeDialog
                    open={temporaryProductEditOpen}
                    onOpenChange={setTemporaryProductEditOpen}
                    item={item}
                    budgetId={budgetId}
                    onSuccess={onRefresh}
                />
            ) : null}
        </div>
    );
}

export const ScopeItemRow = memo(ScopeItemRowInner);

"use client";

import { useState, useEffect, useRef } from "react";
import type { HTMLAttributes } from "react";
import { GripVertical, Trash2 } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { ProductGroup } from "@/actions/product-group-actions";
import type { BudgetItem } from "@/types/budget-types";
import {
    updateItemQuantityAction,
    updateItemGroupInSectionAction,
    deleteItemAction,
} from "@/actions/budget-hierarchy-section-items-actions";
import { formatCurrency, NO_GROUP_VALUE } from "./budget-scope-utils";

export function ScopeItemRow({
    item,
    budgetId,
    isReadOnly,
    onRefresh,
    indented = false,
    dragHandleProps,
    groups = [],
}: {
    item: BudgetItem;
    budgetId: string;
    isReadOnly: boolean;
    onRefresh: () => void;
    indented?: boolean;
    dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
    groups?: ProductGroup[];
}) {
    const [qty, setQty] = useState(item.quantity);
    const [groupSaving, setGroupSaving] = useState(false);
    const qtyDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        // Sincroniza quantidade quando o item vindo do servidor muda (ex.: após refresh)
        // eslint-disable-next-line react-hooks/set-state-in-effect -- derivado de prop externa
        setQty(item.quantity);
    }, [item.quantity]);

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
    const unitPrice = Number(item.unit_price) || 0;
    const laborCost = Number(item.labor_cost) || 0;
    const total = (unitPrice + laborCost) * qty;

    const currentGroupId = (item as Record<string, unknown>).group_id as string | undefined;
    const selectValue = currentGroupId ?? NO_GROUP_VALUE;

    const handleQtyChange = (val: number) => {
        if (val < 1) return;
        setQty(val);
        if (qtyDebounce.current) clearTimeout(qtyDebounce.current);
        qtyDebounce.current = setTimeout(() => {
            updateItemQuantityAction(item.id!, budgetId, val).then(onRefresh);
        }, 600);
    };

    const handleGroupChange = async (value: string) => {
        const newGroupId = value === NO_GROUP_VALUE ? null : value;
        const newGroupName = newGroupId
            ? (groups.find((g) => g.id === newGroupId)?.name ?? "")
            : undefined;
        setGroupSaving(true);
        const result = await updateItemGroupInSectionAction(
            item.id!,
            budgetId,
            newGroupId,
            newGroupName
        );
        setGroupSaving(false);
        if (!result.success) toast.error(result.error ?? "Erro ao atualizar grupo");
        else onRefresh();
    };

    const handleDelete = async () => {
        const result = await deleteItemAction(item.id!, budgetId);
        if (!result.success) toast.error(result.error || "Erro ao remover");
        else onRefresh();
    };

    return (
        <div
            className={cn(
                "grid grid-cols-12 gap-2 items-center px-2 py-1.5 rounded-md border bg-background text-sm",
                indented && "ml-4"
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
            <div className="col-span-2 flex justify-center">
                {isReadOnly ? (
                    <span className="text-xs">{qty}</span>
                ) : (
                    <input
                        type="number"
                        min={1}
                        value={qty}
                        onChange={(e) => handleQtyChange(Number(e.target.value))}
                        className="w-12 text-center border rounded text-xs h-6"
                    />
                )}
            </div>
            <div className="col-span-2 text-right text-xs text-muted-foreground">
                {formatCurrency(unitPrice)}
            </div>
            <div className="col-span-2 text-right text-xs text-muted-foreground">
                {formatCurrency(laborCost)}
            </div>
            <div className="col-span-1 text-right text-xs font-medium">{formatCurrency(total)}</div>
            <div className="col-span-2 flex items-center justify-end gap-1">
                {!isReadOnly && groups.length > 0 && (
                    <Select
                        value={selectValue}
                        onValueChange={handleGroupChange}
                        disabled={groupSaving}
                    >
                        <SelectTrigger className="h-7 w-[7rem] text-xs border-dashed">
                            <SelectValue placeholder="Grupo" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NO_GROUP_VALUE}>Sem grupo</SelectItem>
                            {groups.map((g) => (
                                <SelectItem key={g.id} value={g.id}>
                                    {g.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
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
    );
}

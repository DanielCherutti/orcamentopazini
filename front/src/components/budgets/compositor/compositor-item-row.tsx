"use client";

import { useState } from "react";
import { GripVertical, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import {
    updateItemGroupInBlockAction,
    updateItemQuantityInBlockAction,
} from "@/actions/budget-compositor-block-items-actions";
import type { ProductGroup } from "@/actions/product-group-actions";
import type { BudgetItem } from "@/types/budget-types";
import { QuantityTextInput } from "@/components/budgets/quantity-text-input";
import { formatCurrency, NO_GROUP_VALUE } from "./compositor-content-utils";

export function CompositorItemRow({
    item,
    budgetId,
    onDelete,
    onRefresh,
    indented,
    isReadOnly,
    groups = [],
}: {
    item: BudgetItem;
    budgetId: string;
    onDelete: (id: string) => void;
    onRefresh: () => void;
    indented?: boolean;
    isReadOnly?: boolean;
    groups?: ProductGroup[];
}) {
    const [qty, setQty] = useState(item.quantity);
    const [saving, setSaving] = useState(false);
    const [groupSaving, setGroupSaving] = useState(false);

    const [prevQty, setPrevQty] = useState(item.quantity);
    if (prevQty !== item.quantity) {
        setPrevQty(item.quantity);
        setQty(item.quantity);
    }

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: item.id! });

    const handleQtyCommit = async () => {
        if (qty === item.quantity || !Number.isFinite(qty) || qty <= 0) return;
        setSaving(true);
        const result = await updateItemQuantityInBlockAction(
            item.id!,
            budgetId,
            qty,
        );
        setSaving(false);
        if (!result.success) {
            toast.error(result.error || "Erro ao atualizar quantidade");
            setQty(item.quantity);
        } else {
            onRefresh();
        }
    };

    const currentGroupId = (item as Record<string, unknown>).group_id as
        | string
        | undefined;
    const selectValue = currentGroupId ?? NO_GROUP_VALUE;

    const handleGroupChange = async (value: string) => {
        const newGroupId = value === NO_GROUP_VALUE ? null : value;
        const newGroupName = newGroupId
            ? (groups.find((g) => g.id === newGroupId)?.name ?? "")
            : undefined;
        setGroupSaving(true);
        const result = await updateItemGroupInBlockAction(
            item.id!,
            budgetId,
            newGroupId,
            newGroupName,
        );
        setGroupSaving(false);
        if (!result.success) toast.error(result.error ?? "Erro ao atualizar grupo");
        else onRefresh();
    };

    const unit = (
        item.product_unit ??
        (typeof item.product_id === "object"
            ? ((item.product_id as Record<string, unknown>).unit as string | undefined)
            : undefined) ??
        ""
    ).trim();
    const name =
        typeof item.product_id === "object"
            ? (((item.product_id as Record<string, unknown>).description as string) ??
              "Produto")
            : "Produto";

    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={`grid grid-cols-12 gap-2 items-center p-2 bg-white rounded-md border text-sm hover:shadow-sm transition-shadow ${indented ? "ml-4" : ""} ${isDragging ? "opacity-50 shadow-lg" : ""}`}
        >
            <div className="col-span-1 flex items-center justify-center">
                {!isReadOnly && (
                    <button
                        type="button"
                        {...attributes}
                        {...listeners}
                        className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground p-0.5 touch-none"
                        aria-label="Arrastar para reordenar"
                    >
                        <GripVertical className="h-4 w-4" />
                    </button>
                )}
            </div>
            <div className="col-span-11 md:col-span-4 font-medium truncate">
                {name}
            </div>
            <div className="col-span-4 md:col-span-2 flex items-center justify-center gap-1">
                <QuantityTextInput
                    value={qty}
                    disabled={saving || isReadOnly}
                    onValueChange={(n) => !isReadOnly && setQty(n)}
                    onBlur={() => !isReadOnly && void handleQtyCommit()}
                    onKeyDown={(e) => {
                        if (!isReadOnly && e.key === "Enter") e.currentTarget.blur();
                    }}
                    className="w-14 text-center border border-input rounded bg-background px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                    aria-label="Quantidade"
                />
                {unit && (
                    <span className="text-xs text-muted-foreground">{unit}</span>
                )}
            </div>
            <div className="hidden md:block md:col-span-2 text-right text-muted-foreground text-xs">
                {formatCurrency(item.labor_cost ?? 0)}
            </div>
            <div className="hidden md:block md:col-span-1 text-right text-muted-foreground text-xs">
                {formatCurrency(item.unit_price)}
            </div>
            <div className="col-span-4 md:col-span-1 text-right font-semibold">
                {formatCurrency(item.total)}
            </div>
            <div className="col-span-4 md:col-span-1 flex items-center justify-end gap-1">
                {!isReadOnly && groups.length > 0 && (
                    <Select
                        value={selectValue}
                        onValueChange={(v) => void handleGroupChange(v)}
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
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => onDelete(item.id!)}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>
        </div>
    );
}

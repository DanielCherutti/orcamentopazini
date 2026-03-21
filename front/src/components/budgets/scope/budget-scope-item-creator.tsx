"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { ProductSelector } from "@/components/products/product-selector";
import { AddGroupDialog } from "@/components/budgets/editor/add-group-dialog";
import type { Product } from "@/actions/product-actions";
import { addItemAction, addGroupToSectionAction } from "@/actions/budget-hierarchy-section-items-actions";

export function ScopeItemCreator({
    sectionId,
    budgetId,
    onSuccess,
}: {
    sectionId: string;
    budgetId: string;
    onSuccess: () => void;
}) {
    const [selected, setSelected] = useState<Product | null>(null);
    const [qty, setQty] = useState(1);
    const [loading, setLoading] = useState(false);

    const handleAdd = async () => {
        if (!selected) {
            toast.error("Selecione um produto");
            return;
        }
        setLoading(true);
        const result = await addItemAction(sectionId, budgetId, selected.id!, qty);
        setLoading(false);
        if (result.success) {
            setSelected(null);
            setQty(1);
            onSuccess();
        } else {
            toast.error(result.error || "Erro ao adicionar produto");
        }
    };

    return (
        <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
            <div className="flex-1">
                <ProductSelector
                    selectedProduct={selected}
                    onSelect={(_id, product) => {
                        if (product) setSelected(product);
                    }}
                />
            </div>
            <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
                className="w-16 text-center border rounded text-xs h-8"
                disabled={!selected}
            />
            <Button size="sm" className="h-8 text-xs" onClick={handleAdd} disabled={!selected || loading}>
                {loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                    <Plus className="h-3.5 w-3.5" />
                )}
            </Button>
        </div>
    );
}

export function ScopeGroupAdder({
    sectionId,
    budgetId,
    onSuccess,
}: {
    sectionId: string;
    budgetId: string;
    onSuccess: () => void;
}) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5"
                type="button"
                onClick={() => setOpen(true)}
            >
                <Plus className="h-3.5 w-3.5" /> Adicionar Grupo de Produtos
            </Button>
            <AddGroupDialog
                open={open}
                onOpenChange={setOpen}
                sectionId={sectionId}
                budgetId={budgetId}
                onSuccess={onSuccess}
                addGroupToSection={addGroupToSectionAction}
            />
        </>
    );
}

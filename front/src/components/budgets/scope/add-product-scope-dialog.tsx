"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { addItemAction } from "@/actions/budget-hierarchy-section-items-actions";
import type { Product } from "@/actions/product-actions";
import { ProductSelector } from "@/components/products/product-selector";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";

/** Popover do catálogo é renderizado em portal (fora do Dialog); sem isso o Radix fecha o modal ou bloqueia a busca. */
function isInsideProductPopover(target: EventTarget | null): boolean {
    return target instanceof Element && Boolean(target.closest("[data-slot='popover-content']"));
}

export function AddProductScopeDialog({
    open,
    onOpenChange,
    sectionId,
    budgetId,
    onSuccess,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sectionId: string;
    budgetId: string;
    onSuccess: () => void;
}) {
    const [selected, setSelected] = useState<Product | null>(null);
    const [qty, setQty] = useState(1);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) {
            setSelected(null);
            setQty(1);
        }
    }, [open]);

    const handleAdd = async () => {
        if (!selected?.id) {
            toast.error("Selecione um produto");
            return;
        }
        setLoading(true);
        const result = await addItemAction(sectionId, budgetId, selected.id, qty);
        setLoading(false);
        if (result.success) {
            onOpenChange(false);
            onSuccess();
        } else {
            toast.error(result.error || "Erro ao adicionar produto");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
            <DialogContent
                className="sm:max-w-md"
                onPointerDownOutside={(e) => {
                    if (isInsideProductPopover(e.target)) e.preventDefault();
                }}
                onInteractOutside={(e) => {
                    if (isInsideProductPopover(e.target)) e.preventDefault();
                }}
                onFocusOutside={(e) => {
                    if (isInsideProductPopover(e.target)) e.preventDefault();
                }}
            >
                <DialogHeader>
                    <DialogTitle>Adicionar produto</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label>Produto</Label>
                        <ProductSelector
                            popoverLayout="dialog"
                            selectedProduct={selected}
                            onSelect={(_id, product) => {
                                if (product) setSelected(product);
                            }}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="scope-add-product-qty">Quantidade</Label>
                        <Input
                            id="scope-add-product-qty"
                            type="number"
                            min={1}
                            value={qty}
                            onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
                            className="w-28"
                        />
                    </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={loading}
                    >
                        Cancelar
                    </Button>
                    <Button type="button" onClick={handleAdd} disabled={!selected || loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

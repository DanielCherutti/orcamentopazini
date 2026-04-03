"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
import { QuantityTextInput } from "@/components/budgets/quantity-text-input";
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
    const [mounted, setMounted] = useState(false);
    const [selected, setSelected] = useState<Product | null>(null);
    const [qty, setQty] = useState(1);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

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
        <>
            {/* Com `modal={false}` o Radix não renderiza overlay; espelha o mesmo destaque do modal de grupos. */}
            {mounted &&
                open &&
                createPortal(
                    <div
                        role="presentation"
                        aria-hidden
                        className="fixed inset-0 z-40 animate-in fade-in-0 duration-200 bg-black/50"
                        onClick={() => onOpenChange(false)}
                    />,
                    document.body,
                )}
            <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
                <DialogContent
                    className="flex max-h-[min(90dvh,calc(100dvh-2rem))] min-h-0 w-[min(52rem,calc(100vw-1.5rem))] max-w-[52rem] flex-col gap-0 overflow-hidden p-0 shadow-xl sm:max-w-[52rem]"
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
                    <DialogHeader className="shrink-0 space-y-1 border-b border-border bg-muted/40 px-6 py-4 text-left">
                        <DialogTitle className="text-xl">Adicionar produto</DialogTitle>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 [scrollbar-gutter:stable]">
                        <div className="space-y-5 rounded-md border border-border bg-muted/5 p-3">
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Produto</Label>
                                <ProductSelector
                                    popoverLayout="dialog"
                                    selectedProduct={selected}
                                    onSelect={(_id, product) => {
                                        if (product) setSelected(product);
                                    }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="scope-add-product-qty">
                                    Quantidade
                                    {selected?.unit?.trim() ? (
                                        <span className="text-muted-foreground font-normal">
                                            {" "}
                                            ({selected.unit.trim()})
                                        </span>
                                    ) : null}
                                </Label>
                                <QuantityTextInput
                                    id="scope-add-product-qty"
                                    value={qty}
                                    min={1}
                                    onValueChange={setQty}
                                    className="flex h-9 w-28 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                    aria-label="Quantidade"
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="shrink-0 gap-2 border-t border-border bg-muted/20 px-6 py-4 sm:gap-0">
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
        </>
    );
}

"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Loader2, PackagePlus } from "lucide-react";
import { addItemAction } from "@/actions/budget-hierarchy-section-items-actions";
import {
    createProductAction,
    getNextProductCodeAction,
    type Product,
} from "@/actions/product-actions";
import { ProductForm } from "@/components/products/product-form";
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

const subscribeToNothing = () => () => {};

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
    const mounted = useSyncExternalStore(subscribeToNothing, () => true, () => false);
    const [selected, setSelected] = useState<Product | null>(null);
    const [qty, setQty] = useState(1);
    const [loading, setLoading] = useState(false);
    const [creatingProduct, setCreatingProduct] = useState(false);
    const [nextProductCode, setNextProductCode] = useState("");
    const [productFieldErrors, setProductFieldErrors] = useState<
        Record<string, string[] | undefined>
    >({});
    const [productGeneralError, setProductGeneralError] = useState("");
    const [catalogRevision, setCatalogRevision] = useState(0);

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setSelected(null);
            setQty(1);
            setCreatingProduct(false);
            setProductFieldErrors({});
            setProductGeneralError("");
        }
        onOpenChange(nextOpen);
    };

    const handleStartCreateProduct = async () => {
        setProductFieldErrors({});
        setProductGeneralError("");
        setNextProductCode("");
        setCreatingProduct(true);

        const result = await getNextProductCodeAction();
        if (result.success && result.data) setNextProductCode(result.data);
    };

    const handleCreateProduct = async (formData: FormData) => {
        setProductFieldErrors({});
        setProductGeneralError("");

        try {
            const result = await createProductAction(formData);
            if (!result.success) {
                setProductGeneralError(result.error || "Erro ao criar produto");
                if (result.fieldErrors) setProductFieldErrors(result.fieldErrors);
                return;
            }

            const created = Array.isArray(result.data) ? result.data[0] : result.data;
            if (!created?.id) {
                setProductGeneralError("Produto criado, mas não foi possível selecioná-lo.");
                return;
            }

            setSelected(created);
            setCatalogRevision((revision) => revision + 1);
            setCreatingProduct(false);
            toast.success("Produto criado e selecionado com sucesso!");
        } catch (error) {
            console.error("Unexpected error creating product from budget:", error);
            setProductGeneralError("Erro inesperado ao salvar o produto.");
        }
    };

    const handleAdd = async () => {
        if (!selected?.id) {
            toast.error("Selecione um produto");
            return;
        }
        setLoading(true);
        const result = await addItemAction(sectionId, budgetId, selected.id, qty);
        setLoading(false);
        if (result.success) {
            handleOpenChange(false);
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
                        onClick={() => handleOpenChange(false)}
                    />,
                    document.body,
                )}
            <Dialog open={open} onOpenChange={handleOpenChange} modal={false}>
                <DialogContent
                    className={`flex max-h-[min(94dvh,calc(100dvh-1rem))] min-h-0 w-[min(68rem,calc(100vw-1.5rem))] flex-col gap-0 overflow-hidden p-0 shadow-xl ${
                        creatingProduct ? "max-w-[68rem] sm:max-w-[68rem]" : "max-w-[52rem] sm:max-w-[52rem]"
                    }`}
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
                        <DialogTitle className="text-xl">
                            {creatingProduct ? "Criar produto" : "Adicionar produto"}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 [scrollbar-gutter:stable]">
                        {creatingProduct ? (
                            <ProductForm
                                defaultCode={nextProductCode}
                                action={handleCreateProduct}
                                errors={productFieldErrors}
                                generalError={productGeneralError}
                                onCancel={() => setCreatingProduct(false)}
                            />
                        ) : (
                            <div className="space-y-5 rounded-md border border-border bg-muted/5 p-3">
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Produto</Label>
                                    <ProductSelector
                                        key={catalogRevision}
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
                                        onValueChange={setQty}
                                        className="flex h-9 w-28 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                        aria-label="Quantidade"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    {!creatingProduct ? (
                        <DialogFooter className="shrink-0 gap-2 border-t border-border bg-muted/20 px-6 py-4 sm:justify-between">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={handleStartCreateProduct}
                                disabled={loading}
                            >
                                <PackagePlus className="h-4 w-4" />
                                Criar Produto
                            </Button>
                            <div className="flex flex-col-reverse gap-2 sm:flex-row">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => handleOpenChange(false)}
                                    disabled={loading}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="button"
                                    onClick={handleAdd}
                                    disabled={!selected || loading}
                                >
                                    {loading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        "Adicionar"
                                    )}
                                </Button>
                            </div>
                        </DialogFooter>
                    ) : null}
                </DialogContent>
            </Dialog>
        </>
    );
}

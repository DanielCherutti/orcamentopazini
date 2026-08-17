"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import {
    addTemporaryProductToSectionAction,
    updateTemporaryProductInSectionAction,
} from "@/actions/budget-hierarchy-section-items-actions";
import { QuantityTextInput } from "@/components/budgets/quantity-text-input";
import {
    TemporaryProductFormFields,
    createEmptyTemporaryProductValues,
    type TemporaryProductFormValues,
} from "@/components/budgets/scope/temporary-product-form-fields";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import {
    temporaryProductInputFromBudgetItem,
} from "@/lib/products/temporary-product";
import type { BudgetItem } from "@/types/budget-types";

function TemporaryProductScopeDialog({
    open,
    onOpenChange,
    sectionId,
    budgetId,
    onSuccess,
    item,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sectionId?: string;
    budgetId: string;
    onSuccess: () => void;
    item?: BudgetItem;
}) {
    const isEditing = Boolean(item);
    const [mounted, setMounted] = useState(false);
    const [values, setValues] = useState<TemporaryProductFormValues>(() =>
        item ? temporaryProductInputFromBudgetItem(item) : createEmptyTemporaryProductValues(),
    );
    const [qty, setQty] = useState(() => Number(item?.quantity ?? 1));
    const [loading, setLoading] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

    useEffect(() => {
        // O portal só pode ser ativado após a hidratação, quando `document.body` existe.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true);
    }, []);

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setValues(
                item
                    ? temporaryProductInputFromBudgetItem(item)
                    : createEmptyTemporaryProductValues(),
            );
            setQty(Number(item?.quantity ?? 1));
            setFieldErrors({});
        }
        onOpenChange(nextOpen);
    };

    const handleSubmit = async () => {
        setLoading(true);
        setFieldErrors({});
        const result = item?.id
            ? await updateTemporaryProductInSectionAction(item.id, budgetId, values, qty)
            : sectionId
              ? await addTemporaryProductToSectionAction(sectionId, budgetId, values, qty)
              : { success: false, error: "Trecho não informado" };
        setLoading(false);
        if (result.success) {
            toast.success(
                isEditing ? "Produto temporário atualizado" : "Produto temporário adicionado",
            );
            handleOpenChange(false);
            onSuccess();
            return;
        }
        if (result.fieldErrors) {
            const mapped: Record<string, string | undefined> = {};
            for (const [key, msgs] of Object.entries(result.fieldErrors)) {
                mapped[key] = msgs?.[0];
            }
            setFieldErrors(mapped);
        }
        toast.error(
            result.error ||
                (isEditing
                    ? "Erro ao atualizar produto temporário"
                    : "Erro ao adicionar produto temporário"),
        );
    };

    return (
        <>
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
                <DialogContent className="flex max-h-[min(90dvh,calc(100dvh-2rem))] min-h-0 w-[min(52rem,calc(100vw-1.5rem))] max-w-[52rem] flex-col gap-0 overflow-hidden p-0 shadow-xl sm:max-w-[52rem]">
                    <DialogHeader className="shrink-0 space-y-1 border-b border-border bg-muted/40 px-6 py-4 text-left">
                        <DialogTitle className="text-xl">
                            {isEditing ? "Editar produto temporário" : "Adicionar produto temporário"}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 [scrollbar-gutter:stable]">
                        <div className="space-y-5 rounded-md border border-border bg-muted/5 p-3">
                            <TemporaryProductFormFields
                                values={values}
                                onChange={setValues}
                                errors={fieldErrors}
                                disabled={loading}
                            />
                            <div className="space-y-2 border-t border-border/60 pt-4">
                                <Label htmlFor="temp-product-qty">
                                    Quantidade
                                    {values.unit.trim() ? (
                                        <span className="font-normal text-muted-foreground">
                                            {" "}
                                            ({values.unit.trim()})
                                        </span>
                                    ) : null}
                                </Label>
                                <QuantityTextInput
                                    id="temp-product-qty"
                                    value={qty}
                                    onValueChange={setQty}
                                    disabled={loading}
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
                            onClick={() => handleOpenChange(false)}
                            disabled={loading}
                        >
                            Cancelar
                        </Button>
                        <Button type="button" onClick={handleSubmit} disabled={loading}>
                            {loading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : isEditing ? (
                                "Salvar alterações"
                            ) : (
                                "Adicionar"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

export function AddTemporaryProductScopeDialog(
    props: Omit<ComponentProps<typeof TemporaryProductScopeDialog>, "item"> & {
        sectionId: string;
    },
) {
    return <TemporaryProductScopeDialog {...props} />;
}

export function EditTemporaryProductScopeDialog(
    props: Omit<ComponentProps<typeof TemporaryProductScopeDialog>, "sectionId"> & {
        item: BudgetItem;
    },
) {
    return <TemporaryProductScopeDialog {...props} />;
}

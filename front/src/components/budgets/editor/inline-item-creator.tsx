"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { ProductSelector } from "@/components/products/product-selector";
import { QuantityTextInput } from "@/components/budgets/quantity-text-input";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { useBudgetsRepository } from "@/lib/budgets/use-budgets-repository";
import type { Product } from "@/actions/product-actions";

interface InlineItemCreatorProps {
    sectionId: string;
    budgetId: string; // Adicionado
    onSuccess: () => void;
}

export function InlineItemCreator({ sectionId, budgetId, onSuccess }: InlineItemCreatorProps) {
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [quantity, setQuantity] = useState<number>(1);
    const [isLoading, setIsLoading] = useState(false);
    const repo = useBudgetsRepository();

    const unitPrice = selectedProduct
        ? (selectedProduct.equipmentPrice + selectedProduct.assemblyPrice)
        : 0;

    const totalPrice = unitPrice * quantity;

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    const handleAdd = async () => {
        if (!selectedProduct) {
            toast.error("Selecione um produto");
            return;
        }
        if (quantity <= 0) {
            toast.error("Quantidade deve ser maior que zero");
            return;
        }

        setIsLoading(true);
        try {
            // Assinatura: sectionId, budgetId, productId, quantity
            const result = await repo.addItem(sectionId, budgetId, selectedProduct.id!, quantity);

            if (result.success) {
                toast.success("Item adicionado");
                setSelectedProduct(null);
                setQuantity(1);
                onSuccess();
            } else {
                toast.error("Erro ao adicionar item", { description: result.error });
            }
        } catch (error) {
            console.error(error);
            toast.error("Erro ao adicionar item");
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleAdd();
        }
    };

    return (
        <div className="grid grid-cols-12 gap-2 items-center p-2 bg-muted/30 rounded-md border border-dashed border-muted hover:border-primary/50 transition-colors">

            <div className="col-span-12 md:col-span-6">
                <ProductSelector
                    onSelect={(id, prod) => setSelectedProduct(prod || null)}
                    selectedProduct={selectedProduct}
                    className="border-none bg-transparent hover:bg-white focus:bg-white transition-colors h-8"
                />
            </div>

            <div className="col-span-4 md:col-span-2 flex items-center gap-1 min-w-0">
                <QuantityTextInput
                    value={quantity}
                    min={1}
                    onValueChange={setQuantity}
                    onKeyDown={handleKeyDown}
                    className="flex h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 py-1 text-center text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    aria-label="Quantidade"
                />
                {selectedProduct?.unit?.trim() ? (
                    <span
                        className="text-[11px] text-muted-foreground shrink-0 max-w-[3.5rem] truncate"
                        title={selectedProduct.unit.trim()}
                    >
                        {selectedProduct.unit.trim()}
                    </span>
                ) : null}
            </div>

            <div className="col-span-4 md:col-span-2 text-right text-xs text-muted-foreground hidden md:block">
                {selectedProduct ? formatCurrency(unitPrice) : "-"}
            </div>

            <div className="col-span-4 md:col-span-1 text-right font-medium text-sm">
                {selectedProduct ? formatCurrency(totalPrice) : "-"}
            </div>

            <div className="col-span-12 md:col-span-1 flex justify-end">
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                    onClick={handleAdd}
                    disabled={isLoading || !selectedProduct}
                >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
            </div>
        </div>
    );
}


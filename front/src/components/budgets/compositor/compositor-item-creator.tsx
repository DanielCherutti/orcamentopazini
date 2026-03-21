"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { ProductSelector } from "@/components/products/product-selector";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { addItemToBlockAction } from "@/actions/budget-compositor-actions";
import type { Product } from "@/actions/product-actions";

interface CompositorItemCreatorProps {
  blockId: string;
  budgetId: string;
  onSuccess: () => void;
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

export function CompositorItemCreator({ blockId, budgetId, onSuccess }: CompositorItemCreatorProps) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [loading, setLoading] = useState(false);

  const unitPrice = selectedProduct
    ? selectedProduct.equipmentPrice + selectedProduct.assemblyPrice
    : 0;

  const handleAdd = async () => {
    if (!selectedProduct) { toast.error("Selecione um produto"); return; }
    if (quantity <= 0) { toast.error("Quantidade deve ser maior que zero"); return; }

    setLoading(true);
    const result = await addItemToBlockAction(blockId, budgetId, selectedProduct.id!, quantity);
    setLoading(false);

    if (result.success) {
      toast.success("Item adicionado");
      setSelectedProduct(null);
      setQuantity(1);
      onSuccess();
    } else {
      toast.error(result.error || "Erro ao adicionar item");
    }
  };

  return (
    <div className="grid grid-cols-12 gap-2 items-center p-2 bg-muted/30 rounded-md border border-dashed border-muted hover:border-primary/50 transition-colors">
      <div className="col-span-12 md:col-span-6">
        <ProductSelector
          onSelect={(_, prod) => setSelectedProduct(prod || null)}
          selectedProduct={selectedProduct}
          className="border-none bg-transparent hover:bg-white focus:bg-white transition-colors h-8"
        />
      </div>
      <div className="col-span-4 md:col-span-2">
        <Input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          className="h-8 text-center"
          placeholder="Qtd"
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
        />
      </div>
      <div className="col-span-4 md:col-span-2 text-right text-xs text-muted-foreground hidden md:block">
        {selectedProduct ? formatCurrency(unitPrice) : "-"}
      </div>
      <div className="col-span-4 md:col-span-1 text-right font-medium text-sm">
        {selectedProduct ? formatCurrency(unitPrice * quantity) : "-"}
      </div>
      <div className="col-span-12 md:col-span-1 flex justify-end">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
          onClick={handleAdd}
          disabled={loading || !selectedProduct}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

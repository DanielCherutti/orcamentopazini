"use client";

import * as React from "react";
import { ChevronsUpDown, Package } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { getProductsAction, type Product } from "@/actions/product-actions";

interface ProductSelectorProps {
    onSelect: (productId: string, product?: Product) => void;
    className?: string;
    selectedProduct?: Product | null;
}

export function ProductSelector({ onSelect, className, selectedProduct }: ProductSelectorProps) {
    const [open, setOpen] = React.useState(false);
    const [products, setProducts] = React.useState<Product[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [searchValue, setSearchValue] = React.useState("");

    const doSearch = React.useCallback(async (term: string) => {
        setLoading(true);
        const result = await getProductsAction({ query: term, limit: 100 });
        if (result && result.data) {
            setProducts(result.data);
        }
        setLoading(false);
    }, []);

    const handleSearch = useDebouncedCallback((term: string) => {
        doSearch(term);
    }, 300);

    // Ao abrir o popover: reseta busca e carrega todos
    React.useEffect(() => {
        if (open) {
            setSearchValue("");
            doSearch("");
        }
    }, [open, doSearch]);

    const handleValueChange = (val: string) => {
        setSearchValue(val);
        // Se limpou (vazio), recarrega imediatamente sem debounce
        if (!val.trim()) {
            doSearch("");
        } else {
            handleSearch(val);
        }
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between", className)}
                >
                    {selectedProduct ? (
                        <span className="truncate">{selectedProduct.description}</span>
                    ) : (
                        "Selecione um produto..."
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[50vw] p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Buscar produto por nome ou código..."
                        value={searchValue}
                        onValueChange={handleValueChange}
                    />
                    <CommandList className="max-h-[60vh]">
                        {loading && <div className="py-6 text-center text-sm text-muted-foreground">Buscando...</div>}
                        {!loading && products.length === 0 && (
                            <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                        )}
                        {!loading && (
                            <CommandGroup heading="Produtos Disponíveis">
                                {products.map((product) => (
                                    <CommandItem
                                        key={product.id}
                                        value={product.id}
                                        onSelect={() => {
                                            if (product.id) {
                                                onSelect(product.id, product);
                                                setOpen(false);
                                            }
                                        }}
                                        className="flex items-start gap-2 py-3"
                                    >
                                        <Package className="h-4 w-4 mt-1 text-muted-foreground" />
                                        <div className="flex flex-col flex-1">
                                            <div className="flex justify-between">
                                                <span className="font-medium truncate">{product.description}</span>
                                                <span className="text-xs font-mono ml-2 bg-muted px-1 rounded">{product.code}</span>
                                            </div>
                                            <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                                <span>{product.unit}</span>
                                                <span>Eq: {formatCurrency(product.equipmentPrice)} + Mont: {formatCurrency(product.assemblyPrice)}</span>
                                            </div>
                                        </div>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

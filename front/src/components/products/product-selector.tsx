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

const PAGE_LIMIT = 300;

export function ProductSelector({ onSelect, className, selectedProduct }: ProductSelectorProps) {
    const [open, setOpen] = React.useState(false);
    const [products, setProducts] = React.useState<Product[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [searchValue, setSearchValue] = React.useState("");
    const [totalMatching, setTotalMatching] = React.useState(0);

    const doSearch = React.useCallback(async (term: string) => {
        setLoading(true);
        const result = await getProductsAction({ query: term, limit: PAGE_LIMIT });
        if (result?.success && result.data) {
            setProducts(result.data);
            setTotalMatching(result.meta?.total ?? result.data.length);
        } else {
            setProducts([]);
            setTotalMatching(0);
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
            <PopoverContent
                align="start"
                side="bottom"
                sideOffset={8}
                collisionPadding={16}
                className={cn(
                    "z-[200] w-[min(92vw,42rem)] max-w-[calc(100vw-1rem)] overflow-hidden p-0 shadow-lg",
                    "max-h-[min(78vh,calc(100dvh-4rem))]"
                )}
            >
                <Command shouldFilter={false} className="overflow-hidden rounded-md">
                    <div className="shrink-0 bg-popover">
                        <CommandInput
                            placeholder="Buscar por nome, código ou parte do texto..."
                            value={searchValue}
                            onValueChange={handleValueChange}
                            className="h-11"
                        />
                        <p className="border-b px-3 pb-2.5 pt-0 text-[11px] leading-snug text-muted-foreground">
                            A busca filtra todo o catálogo. Com muitos produtos, use termos mais específicos.
                        </p>
                    </div>
                    <CommandList
                        className={cn(
                            "!max-h-[min(52vh,calc(100dvh-15rem))] min-h-[9rem] overflow-y-auto overflow-x-hidden overscroll-contain py-1",
                            "[scrollbar-gutter:stable]"
                        )}
                    >
                        {loading && (
                            <div className="py-6 text-center text-sm text-muted-foreground">Buscando...</div>
                        )}
                        {!loading && products.length === 0 && (
                            <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                        )}
                        {!loading && products.length > 0 && (
                            <CommandGroup
                                heading={
                                    totalMatching > products.length
                                        ? `Resultados (${products.length} de ${totalMatching})`
                                        : `Produtos (${products.length})`
                                }
                            >
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
                                        <div className="flex flex-col flex-1 min-w-0">
                                            <div className="flex justify-between gap-2">
                                                <span className="font-medium truncate">{product.description}</span>
                                                <span className="text-xs font-mono shrink-0 bg-muted px-1 rounded">
                                                    {product.code}
                                                </span>
                                            </div>
                                            <div className="flex justify-between gap-2 text-xs text-muted-foreground mt-1">
                                                <span>{product.unit}</span>
                                                <span className="truncate text-right">
                                                    Eq: {formatCurrency(product.equipmentPrice)} + Mont:{" "}
                                                    {formatCurrency(product.assemblyPrice)}
                                                </span>
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

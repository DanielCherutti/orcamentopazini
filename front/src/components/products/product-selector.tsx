"use client";

import * as React from "react";
import { ChevronsUpDown, Package, Plus } from "lucide-react";
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
    /** `sm` alinha ao `Button size="sm"` (ex.: barra do escopo ao lado de “Adicionar Grupo”). */
    triggerSize?: "default" | "sm";
    /** Ícone de pacote à esquerda, no mesmo espírito do “+” do botão de grupo. */
    showPackageIcon?: boolean;
    /**
     * `dialog`: painel compacto para uso dentro de `Dialog` (altura limitada, scroll na lista, não ultrapassa a tela).
     */
    popoverLayout?: "default" | "dialog";
}

const PAGE_LIMIT = 300;

export function ProductSelector({
    onSelect,
    className,
    selectedProduct,
    triggerSize = "default",
    showPackageIcon = false,
    popoverLayout = "default",
}: ProductSelectorProps) {
    const inDialog = popoverLayout === "dialog";
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
                    size={triggerSize === "sm" ? "sm" : "default"}
                    className={cn(
                        "w-full justify-between gap-1.5",
                        triggerSize === "sm" && "font-normal",
                        inDialog && "min-h-11 border-primary/25 bg-background text-sm hover:bg-primary/5 hover:border-primary/40",
                        className
                    )}
                >
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                        {showPackageIcon ? (
                            <Package className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                        ) : null}
                        {selectedProduct ? (
                            <span className="truncate">
                                {selectedProduct.description}
                                {selectedProduct.unit?.trim() ? (
                                    <span className="text-muted-foreground font-normal">
                                        {" "}
                                        ({selectedProduct.unit.trim()})
                                    </span>
                                ) : null}
                            </span>
                        ) : (
                            <span className="truncate">
                                Selecione um produto...
                            </span>
                        )}
                    </span>
                    <ChevronsUpDown
                        className={cn(
                            "ml-1 shrink-0 opacity-50",
                            triggerSize === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"
                        )}
                    />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                side="bottom"
                sideOffset={8}
                collisionPadding={inDialog ? 20 : 16}
                className={cn(
                    "z-[200] overflow-hidden p-0 shadow-lg",
                    inDialog
                        ? "flex max-h-[min(52svh,24rem)] w-[min(48rem,calc(100vw-2rem))] max-w-[calc(100vw-1rem)] flex-col"
                        : "max-h-[min(78vh,calc(100dvh-4rem))] w-[min(92vw,42rem)] max-w-[calc(100vw-1rem)]"
                )}
            >
                <Command
                    shouldFilter={false}
                    className={cn("overflow-hidden rounded-md", inDialog && "flex min-h-0 flex-col")}
                >
                    <div
                        className={cn(
                            "shrink-0 bg-popover",
                            inDialog && "border-b-2 border-primary/15 bg-primary/5"
                        )}
                    >
                        <div
                            className={cn(
                                "shrink-0",
                                inDialog &&
                                    "[&_[cmdk-input-wrapper]]:border-0 [&_[cmdk-input-wrapper]]:px-3 [&_[cmdk-input-wrapper]]:py-1.5 [&_[cmdk-input-wrapper]]:min-h-0 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input-wrapper]_svg]:text-primary/70"
                            )}
                        >
                            <CommandInput
                                placeholder="Buscar por nome, código ou parte do texto..."
                                value={searchValue}
                                onValueChange={handleValueChange}
                                className={cn(
                                    inDialog ? "h-10 py-1.5 text-sm placeholder:text-muted-foreground/80" : "h-11"
                                )}
                            />
                        </div>
                        {!inDialog ? (
                            <p className="border-b px-3 pb-2.5 pt-0 text-[11px] leading-snug text-muted-foreground">
                                A busca filtra todo o catálogo. Com muitos produtos, use termos mais específicos.
                            </p>
                        ) : (
                            <p className="border-t border-primary/10 px-3 py-1.5 text-[11px] leading-snug text-primary/90">
                                Digite para filtrar. Resultados abaixo.
                            </p>
                        )}
                    </div>
                    <CommandList
                        className={cn(
                            "overflow-y-auto overflow-x-hidden overscroll-contain py-1 [scrollbar-gutter:stable]",
                            inDialog
                                ? "!max-h-[min(34svh,15rem)] min-h-0"
                                : "!max-h-[min(52vh,calc(100dvh-15rem))] min-h-[9rem]"
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
                                className={cn(inDialog && "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-sm [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-primary")}
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
                                        className={cn(
                                            "flex items-start gap-2",
                                            inDialog
                                                ? cn(
                                                      "mx-1 my-1.5 rounded-lg border border-border/90 bg-background px-3 py-3 shadow-sm",
                                                      "hover:border-primary/45 hover:bg-primary/5",
                                                      "data-[selected=true]:border-primary data-[selected=true]:bg-primary data-[selected=true]:shadow-md",
                                                      "[&[data-selected=true]_.sel-title]:text-primary-foreground",
                                                      "[&[data-selected=true]_.sel-muted]:text-primary-foreground/90",
                                                      "[&[data-selected=true]_.sel-strong]:text-primary-foreground",
                                                      "[&[data-selected=true]_.sel-badge]:bg-primary-foreground/20 [&[data-selected=true]_.sel-badge]:text-primary-foreground",
                                                      "[&[data-selected=true]_.product-sel-icon]:text-primary-foreground",
                                                      "[&[data-selected=true]_.product-sel-plus]:bg-primary-foreground/20 [&[data-selected=true]_.product-sel-plus]:text-primary-foreground"
                                                  )
                                                : "py-3"
                                        )}
                                    >
                                        <Package
                                            className={cn(
                                                "product-sel-icon mt-0.5 shrink-0 text-muted-foreground",
                                                inDialog ? "h-5 w-5" : "h-4 w-4"
                                            )}
                                        />
                                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                            {inDialog ? (
                                                <>
                                                    <p className="sel-title text-left text-sm font-medium leading-snug break-words text-foreground">
                                                        {product.description}
                                                    </p>
                                                    <div className="sel-muted flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                                        <span className="sel-badge sel-strong inline-flex shrink-0 rounded bg-muted px-2 py-0.5 font-mono text-[11px] font-medium text-foreground">
                                                            {product.code}
                                                        </span>
                                                        <span className="sel-strong font-semibold text-foreground">
                                                            {product.unit}
                                                        </span>
                                                        <span className="sel-strong font-mono text-foreground">
                                                            NCM: {product.ncm || "—"}
                                                        </span>
                                                        <span className="min-w-0">
                                                            Eq: {formatCurrency(product.equipmentPrice)} · Mont:{" "}
                                                            {formatCurrency(product.assemblyPrice)}
                                                        </span>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="flex min-w-0 justify-between gap-2">
                                                        <span className="truncate font-medium">
                                                            {product.description}
                                                        </span>
                                                        <span className="shrink-0 rounded bg-muted px-1 font-mono text-xs">
                                                            {product.code}
                                                        </span>
                                                    </div>
                                                    <div className="mt-1 flex justify-between gap-2 text-xs text-muted-foreground">
                                                        <span>{product.unit} · NCM: {product.ncm || "—"}</span>
                                                        <span className="truncate text-right">
                                                            Eq: {formatCurrency(product.equipmentPrice)} + Mont:{" "}
                                                            {formatCurrency(product.assemblyPrice)}
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                        {inDialog ? (
                                            <span
                                                className="product-sel-plus mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm"
                                                aria-hidden
                                            >
                                                <Plus className="h-4 w-4" strokeWidth={2.5} />
                                            </span>
                                        ) : null}
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

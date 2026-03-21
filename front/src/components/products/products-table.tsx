"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getProductsAction } from "@/actions/product-actions";
import { Edit, ArrowUpDown, ArrowUp, ArrowDown, ImageIcon } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/products/product-card";
import type { Product } from "@/actions/product-actions";

interface ProductsTableProps {
    initialProducts: Product[];
    initialMeta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

export function ProductsTable({ initialProducts, initialMeta }: ProductsTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const [products, setProducts] = useState(initialProducts);
    const [meta, setMeta] = useState(initialMeta);
    const [isLoading, setIsLoading] = useState(false);

    // Track if this is the first render
    const isFirstRender = useRef(true);

    const query = searchParams.get("query") || "";
    const page = Number(searchParams.get("page")) || 1;
    const limit = Number(searchParams.get("limit")) || 10;
    const sortBy = searchParams.get("sortBy") || "created_at";
    const sortOrder = (searchParams.get("sortOrder") as "asc" | "desc") || "desc";

    // Fetch products when URL params change
    useEffect(() => {
        // Skip fetch on first render (we already have SSR data)
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        const fetchProducts = async () => {
            setIsLoading(true);

            const result = await getProductsAction({ page, query, limit, sortBy, sortOrder });

            if (result.success && result.data && result.meta) {
                setProducts(result.data);
                setMeta(result.meta);
            }

            setIsLoading(false);
        };

        fetchProducts();
    }, [page, limit, query, sortBy, sortOrder]);

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("page", newPage.toString());

        startTransition(() => {
            router.push(`?${params.toString()}`, { scroll: false });
        });
    };

    const handleLimitChange = (newLimit: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("limit", newLimit);
        params.set("page", "1"); // Reset to first page

        startTransition(() => {
            router.push(`?${params.toString()}`, { scroll: false });
        });
    };

    const handleSort = (column: string) => {
        const params = new URLSearchParams(searchParams.toString());

        // Toggle sort order if clicking the same column
        if (sortBy === column) {
            params.set("sortOrder", sortOrder === "asc" ? "desc" : "asc");
        } else {
            // New column, default to ascending
            params.set("sortBy", column);
            params.set("sortOrder", "asc");
        }

        params.set("page", "1"); // Reset to first page

        startTransition(() => {
            router.push(`?${params.toString()}`, { scroll: false });
        });
    };

    const getSortIcon = (column: string) => {
        if (sortBy !== column) {
            return <ArrowUpDown className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-50 transition-opacity" />;
        }
        return sortOrder === "asc"
            ? <ArrowUp className="h-3 w-3 ml-1" />
            : <ArrowDown className="h-3 w-3 ml-1" />;
    };

    const total = meta?.total ?? 0;
    const totalPages = meta?.totalPages ?? 1;
    const currentPage = meta?.page ?? 1;

    return (
        <>
            {/* Loading overlay */}
            {(isLoading || isPending) && (
                <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        Carregando...
                    </div>
                </div>
            )}

            {/* Desktop Table */}
            <div className="hidden md:block rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-muted/30 border-b border-border">
                        <tr>
                            <th className="h-10 px-4 text-left font-medium text-muted-foreground w-[64px]">
                                Imagem
                            </th>
                            <th
                                className="h-10 px-4 text-left font-medium text-muted-foreground w-[120px] cursor-pointer hover:bg-muted/50 transition-colors group"
                                onClick={() => handleSort("code")}
                            >
                                <div className="flex items-center">
                                    Código
                                    {getSortIcon("code")}
                                </div>
                            </th>
                            <th
                                className="h-10 px-4 text-left font-medium text-muted-foreground cursor-pointer hover:bg-muted/50 transition-colors group"
                                onClick={() => handleSort("description")}
                            >
                                <div className="flex items-center">
                                    Descrição
                                    {getSortIcon("description")}
                                </div>
                            </th>
                            <th
                                className="h-10 px-4 text-center font-medium text-muted-foreground w-[80px] cursor-pointer hover:bg-muted/50 transition-colors group"
                                onClick={() => handleSort("unit")}
                            >
                                <div className="flex items-center justify-center">
                                    Unidade
                                    {getSortIcon("unit")}
                                </div>
                            </th>
                            <th
                                className="h-10 px-4 text-left font-medium text-muted-foreground w-[120px] cursor-pointer hover:bg-muted/50 transition-colors group"
                                onClick={() => handleSort("equipmentPrice")}
                            >
                                <div className="flex items-center">
                                    Preço Equip.
                                    {getSortIcon("equipmentPrice")}
                                </div>
                            </th>
                            <th
                                className="h-10 px-4 text-left font-medium text-muted-foreground w-[120px] cursor-pointer hover:bg-muted/50 transition-colors group"
                                onClick={() => handleSort("assemblyPrice")}
                            >
                                <div className="flex items-center">
                                    Preço Mont.
                                    {getSortIcon("assemblyPrice")}
                                </div>
                            </th>
                            <th className="h-10 px-4 text-right font-medium text-muted-foreground w-[100px]">
                                Ações
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {products && products.length > 0 ? (
                            products.map((product) => (
                                <tr
                                    key={product.id}
                                    className="border-b border-border hover:bg-muted/20 transition-colors"
                                >
                                    <td className="p-4">
                                        {product.imageUrl ? (
                                            <div className="relative w-12 h-12 rounded-md overflow-hidden bg-muted">
                                                <Image
                                                    src={product.imageUrl}
                                                    alt={product.description}
                                                    fill
                                                    sizes="48px"
                                                    className="object-cover"
                                                    unoptimized
                                                />
                                            </div>
                                        ) : (
                                            <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center">
                                                <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-4">{product.code}</td>
                                    <td className="p-4">{product.description}</td>
                                    <td className="p-4 text-center">{product.unit}</td>
                                    <td className="p-4">
                                        {product.equipmentPrice.toLocaleString("pt-BR", {
                                            style: "currency",
                                            currency: "BRL",
                                        })}
                                    </td>
                                    <td className="p-4">
                                        {product.assemblyPrice.toLocaleString("pt-BR", {
                                            style: "currency",
                                            currency: "BRL",
                                        })}
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center justify-end gap-2">
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="rounded-sm h-8 w-8"
                                                asChild
                                            >
                                                <Link href={`/dashboard/products/${product.id!.includes(":") ? product.id!.split(":")[1] : product.id}`}>
                                                    <Edit className="h-4 w-4" />
                                                </Link>
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                                    {query
                                        ? `Nenhum produto encontrado para "${query}"`
                                        : "Nenhum produto cadastrado"}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
                {products && products.length > 0 ? (
                    products.map((product) => (
                        <ProductCard
                            key={product.id}
                            product={product}
                        />
                    ))
                ) : (
                    <div className="p-8 text-center text-muted-foreground border border-border rounded-sm">
                        {query
                            ? `Nenhum produto encontrado para "${query}"`
                            : "Nenhum produto cadastrado"}
                    </div>
                )}
            </div>

            {/* Pagination Controls */}
            {products && products.length > 0 && (
                <div className="flex flex-col gap-4 pt-4 border-t border-border">
                    {/* Record Info & Items Selector */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <p className="text-sm text-muted-foreground font-medium">
                            Mostrando {(currentPage - 1) * limit + 1}-{Math.min(currentPage * limit, total)} de {total} produtos
                        </p>

                        {/* Items per page selector */}
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Itens por página:</span>
                            <select
                                value={limit}
                                onChange={(e) => handleLimitChange(e.target.value)}
                                className="h-9 rounded-sm border border-input bg-background px-3 text-sm"
                                disabled={isLoading || isPending}
                            >
                                <option value="10">10</option>
                                <option value="20">20</option>
                                <option value="50">50</option>
                                <option value="100">100</option>
                            </select>
                        </div>
                    </div>

                    {/* Pagination Navigation */}
                    {totalPages > 1 && (
                        <div className="flex flex-col sm:flex-row items-center gap-4">
                            <div className="text-sm text-muted-foreground font-medium">
                                Página {currentPage} de {totalPages}
                            </div>

                            <div className="flex items-center gap-1">
                                {/* First */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePageChange(1)}
                                    disabled={currentPage === 1 || isLoading || isPending}
                                    className="rounded-sm h-9 w-9 p-0"
                                    title="Primeira página"
                                >
                                    ««
                                </Button>

                                {/* Previous */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePageChange(currentPage - 1)}
                                    disabled={currentPage === 1 || isLoading || isPending}
                                    className="rounded-sm h-9 px-3"
                                    title="Página anterior"
                                >
                                    ‹ <span className="hidden sm:inline ml-1">Anterior</span>
                                </Button>

                                {/* Next */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePageChange(currentPage + 1)}
                                    disabled={currentPage === totalPages || isLoading || isPending}
                                    className="rounded-sm h-9 px-3"
                                    title="Próxima página"
                                >
                                    <span className="hidden sm:inline mr-1">Próximo</span> ›
                                </Button>

                                {/* Last */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePageChange(totalPages)}
                                    disabled={currentPage === totalPages || isLoading || isPending}
                                    className="rounded-sm h-9 w-9 p-0"
                                    title="Última página"
                                >
                                    »»
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Produtos",
};
import { getProductsAction } from "@/actions/product-actions";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/products/search-input";
import { SearchBadge } from "@/components/products/search-badge";
import { Suspense } from "react";
import { ProductListSkeleton } from "@/components/products/product-list-skeleton";
import { ProductsTable } from "@/components/products/products-table";

async function ProductsContent({
    searchParams,
}: {
    searchParams: { query?: string; page?: string; limit?: string };
}) {
    const query = searchParams.query || "";
    const page = Number(searchParams.page) || 1;
    const limit = Number(searchParams.limit) || 10;

    const result = await getProductsAction({ page, query, limit });


    const { data: products, meta } = result;

    // Safe defaults if meta is undefined
    const total = meta?.total ?? 0;
    const totalPages = meta?.totalPages ?? 1;

    return (
        <>
            {/* Search Badge */}
            <div className="flex items-center gap-3 flex-wrap">
                <SearchBadge />
            </div>

            {/* Products Table with Client-Side Pagination */}
            <div className="relative">
                <ProductsTable
                    initialProducts={products || []}
                    initialMeta={{
                        total,
                        page,
                        limit,
                        totalPages,
                    }}
                />
            </div>
        </>
    );
}

export default async function ProductsPage({
    searchParams,
}: {
    searchParams: Promise<{ query?: string; page?: string; limit?: string }>;
}) {
    const params = await searchParams;

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Catálogo de Produtos</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Gerencie o catálogo de equipamentos e serviços de segurança
                    </p>
                </div>

                <Button asChild className="rounded-sm">
                    <Link href="/dashboard/products/new">
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar Produto
                    </Link>
                </Button>
            </div>

            <div className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-6">
                <SearchInput />

                <Suspense fallback={<ProductListSkeleton />}>
                    <ProductsContent searchParams={params} />
                </Suspense>
            </div>
        </div>
    );
}

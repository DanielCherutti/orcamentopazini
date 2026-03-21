import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { getProductsAction } from "@/actions/product-actions";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/products/search-input";
import { SearchBadge } from "@/components/products/search-badge";
import { ProductListSkeleton } from "@/components/products/product-list-skeleton";
import { ProductsTable } from "@/components/products/products-table";
import { DashboardContentCard, DashboardPageShell } from "@/components/layout/dashboard-page-shell";

export const metadata: Metadata = {
    title: "Produtos",
};

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
        <DashboardPageShell
            title="Catálogo de produtos"
            description="Equipamentos, serviços e itens usados nos orçamentos. Busque, ordene e mantenha preços atualizados."
            action={
                <Button asChild className="rounded-lg shadow-sm">
                    <Link href="/dashboard/products/new">
                        <Plus className="mr-2 h-4 w-4" />
                        Novo produto
                    </Link>
                </Button>
            }
        >
            <DashboardContentCard className="space-y-6">
                <SearchInput />

                <Suspense fallback={<ProductListSkeleton />}>
                    <ProductsContent searchParams={params} />
                </Suspense>
            </DashboardContentCard>
        </DashboardPageShell>
    );
}

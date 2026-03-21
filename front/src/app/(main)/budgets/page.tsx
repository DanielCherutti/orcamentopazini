import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
    title: "Orçamentos",
};
import { Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getBudgetsAction } from "@/actions/budget-actions";
import { BudgetsTable } from "@/components/budgets/budgets-table";
import { SearchInput } from "@/components/budgets/search-input";
import { SearchBadge } from "@/components/budgets/search-badge";

export default async function BudgetsPage(props: {
    searchParams?: Promise<{
        query?: string;
        page?: string;
        limit?: string;
        sortBy?: string;
        sortOrder?: string;
    }>;
}) {
    const searchParams = await props.searchParams;
    const query = searchParams?.query || "";
    const currentPage = Number(searchParams?.page) || 1;
    const limit = Number(searchParams?.limit) || 10;
    const sortBy = searchParams?.sortBy || "created_at";
    const sortOrder = (searchParams?.sortOrder as "asc" | "desc") || "desc";

    const initial = await getBudgetsAction({ query, page: currentPage, limit, sortBy, sortOrder }).then((r) => ({
        budgets: r.data || [],
        meta: r.meta || { total: 0, page: 1, limit: 10, totalPages: 1 },
    }));

    return (
        <div className="max-w-7xl mx-auto p-6 flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Orçamentos</h1>
                    <p className="text-muted-foreground">
                        Gerencie e acompanhe suas propostas comerciais.
                    </p>
                </div>
                <Button asChild>
                    <Link href="/budgets/new">
                        <Plus className="mr-2 h-4 w-4" /> Novo Orçamento
                    </Link>
                </Button>
            </div>

            <div className="flex flex-col gap-6 rounded-xl border bg-card text-card-foreground shadow-sm p-6">
                <div className="flex flex-col md:flex-row gap-4 justify-between">
                    <div className="w-full md:w-72">
                        <SearchInput />
                    </div>
                </div>

                <Suspense fallback={<TableSkeleton />}>
                    <div className="flex items-center gap-3 flex-wrap">
                        <SearchBadge />
                    </div>

                    <div className="relative">
                        <BudgetsTable
                            initialBudgets={initial.budgets}
                            initialMeta={initial.meta}
                        />
                    </div>
                </Suspense>
            </div>
        </div>
    );
}

function TableSkeleton() {
    return (
        <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
        </div>
    );
}

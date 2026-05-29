import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getBudgetsAction } from "@/actions/budget-actions";
import { BudgetImportDialog } from "@/components/budgets/budget-import-dialog";
import { BudgetsTable } from "@/components/budgets/budgets-table";
import { SearchInput } from "@/components/budgets/search-input";
import { SearchBadge } from "@/components/budgets/search-badge";
import { DashboardContentCard, DashboardPageShell } from "@/components/layout/dashboard-page-shell";

export const metadata: Metadata = {
    title: "Orçamentos",
};

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
        <DashboardPageShell
            title="Orçamentos"
            description="Propostas comerciais em rascunho ou enviadas. Busque por título ou cliente."
            action={
                <div className="flex flex-wrap items-center gap-2">
                    <BudgetImportDialog />
                    <Button asChild className="rounded-lg shadow-sm">
                        <Link href="/budgets/new">
                            <Plus className="mr-2 h-4 w-4" />
                            Novo orçamento
                        </Link>
                    </Button>
                </div>
            }
        >
            <DashboardContentCard className="flex flex-col gap-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="w-full max-w-md">
                        <SearchInput />
                    </div>
                </div>

                <Suspense fallback={<TableSkeleton />}>
                    <div className="flex flex-wrap items-center gap-3">
                        <SearchBadge />
                    </div>

                    <div className="relative">
                        <BudgetsTable initialBudgets={initial.budgets} initialMeta={initial.meta} />
                    </div>
                </Suspense>
            </DashboardContentCard>
        </DashboardPageShell>
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

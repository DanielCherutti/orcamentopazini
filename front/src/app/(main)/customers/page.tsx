import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listCustomersAction } from "@/actions/client-actions";
import { CustomersTable } from "@/components/clients/customers-table";
import { CustomerSearchInput } from "@/components/clients/customer-search-input";

export const metadata: Metadata = {
    title: "Clientes",
};

async function CustomersContent({
    searchParams,
}: {
    searchParams: { query?: string; page?: string; limit?: string; sortBy?: string; sortOrder?: string };
}) {
    const query = searchParams.query || "";
    const page = Number(searchParams.page) || 1;
    const limit = Number(searchParams.limit) || 10;
    const sortBy = searchParams.sortBy || "name";
    const sortOrder = (searchParams.sortOrder as "asc" | "desc") || "asc";

    const result = await listCustomersAction({ query, page, limit, sortBy, sortOrder });

    if (!result.success) {
        return (
            <div className="p-8 text-center text-red-500 border border-red-200 rounded-sm bg-red-50">
                Erro ao carregar clientes: {result.error}
            </div>
        );
    }

    const { data: customers, meta } = result;
    const total = meta?.total ?? 0;
    const totalPages = meta?.totalPages ?? 1;

    return (
        <div className="relative">
            <CustomersTable
                initialCustomers={customers || []}
                initialMeta={{ total, page, limit, totalPages }}
            />
        </div>
    );
}

function CustomersSkeleton() {
    return (
        <div className="rounded-md border border-border overflow-hidden animate-pulse">
            <div className="h-10 bg-muted/30 border-b border-border" />
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 border-b border-border bg-muted/10" />
            ))}
        </div>
    );
}

export default async function CustomersPage({
    searchParams,
}: {
    searchParams: Promise<{ query?: string; page?: string; limit?: string; sortBy?: string; sortOrder?: string }>;
}) {
    const params = await searchParams;

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Gerencie os clientes cadastrados
                    </p>
                </div>

                <Button asChild className="rounded-sm">
                    <Link href="/customers/new">
                        <Plus className="mr-2 h-4 w-4" />
                        Novo Cliente
                    </Link>
                </Button>
            </div>

            <div className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-6">
                <CustomerSearchInput defaultValue={params.query} />

                <Suspense fallback={<CustomersSkeleton />}>
                    <CustomersContent searchParams={params} />
                </Suspense>
            </div>
        </div>
    );
}

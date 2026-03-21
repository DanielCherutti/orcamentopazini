import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listCustomersAction } from "@/actions/client-actions";
import { CustomersTable } from "@/components/clients/customers-table";
import { CustomerSearchInput } from "@/components/clients/customer-search-input";
import { DashboardContentCard, DashboardPageShell } from "@/components/layout/dashboard-page-shell";

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
        <DashboardPageShell
            title="Clientes"
            description="Cadastro de empresas e contatos vinculados aos orçamentos."
            action={
                <Button asChild className="rounded-lg shadow-sm">
                    <Link href="/customers/new">
                        <Plus className="mr-2 h-4 w-4" />
                        Novo cliente
                    </Link>
                </Button>
            }
        >
            <DashboardContentCard className="space-y-6">
                <CustomerSearchInput defaultValue={params.query} />

                <Suspense fallback={<CustomersSkeleton />}>
                    <CustomersContent searchParams={params} />
                </Suspense>
            </DashboardContentCard>
        </DashboardPageShell>
    );
}

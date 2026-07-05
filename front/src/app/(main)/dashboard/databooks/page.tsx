import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { getDatabookTemplatesAction } from "@/actions/databook-template-actions";
import { Button } from "@/components/ui/button";
import { DashboardContentCard, DashboardPageShell } from "@/components/layout/dashboard-page-shell";
import { DatabooksListClient } from "@/components/databooks/databooks-list-client";
import { DatabooksSearchInput } from "@/components/databooks/databooks-search-input";

export const metadata: Metadata = {
    title: "DataBooks",
};

export default async function DatabooksPage({
    searchParams,
}: {
    searchParams: Promise<{ query?: string; page?: string }>;
}) {
    const params = await searchParams;
    const page = Number(params.page) || 1;
    const query = params.query?.trim() || "";

    const result = await getDatabookTemplatesAction({ limit: 20, page, query });
    const templates = result.data ?? [];
    const meta = result.meta ?? { total: 0, page: 1, limit: 20, totalPages: 1 };

    return (
        <DashboardPageShell
            title="DataBooks"
            description="Modelos de entrega técnica: áreas AD, checklist e memorial de referência. Usados ao abrir um projeto de entrega."
            action={
                <Button asChild className="rounded-lg shadow-sm">
                    <Link href="/dashboard/databooks/new">
                        <Plus className="mr-2 h-4 w-4" />
                        Novo DataBook
                    </Link>
                </Button>
            }
        >
            <DashboardContentCard className="space-y-6">
                <Suspense fallback={null}>
                    <DatabooksSearchInput />
                </Suspense>
                <DatabooksListClient
                    initialTemplates={templates}
                    initialMeta={meta}
                    query={query}
                />
            </DashboardContentCard>
        </DashboardPageShell>
    );
}

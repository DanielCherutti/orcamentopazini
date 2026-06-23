import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listProductGroupsAction, getProductGroupProductCountsAction } from "@/actions/product-group-actions";
import { ProductGroupsTable } from "@/components/products/groups/product-groups-table";
import { DashboardContentCard, DashboardPageShell } from "@/components/layout/dashboard-page-shell";

export const metadata: Metadata = {
  title: "Grupos de Produtos",
};

export default async function ProductGroupsPage() {
  const res = await listProductGroupsAction();
  const groups = res.data ?? [];

  const countsRes = await getProductGroupProductCountsAction(groups.map((g) => g.id));
  const productCounts = countsRes.counts;

  return (
    <DashboardPageShell
      title="Grupos de produtos"
      description="Agrupe itens do catálogo para inserção rápida em orçamentos e adequações."
      action={
        <Button asChild className="rounded-lg shadow-sm">
          <Link href="/dashboard/products/groups/new">
            <Plus className="mr-2 h-4 w-4" />
            Novo grupo
          </Link>
        </Button>
      }
    >
      <DashboardContentCard>
        <ProductGroupsTable groups={groups} productCounts={productCounts} />
      </DashboardContentCard>
    </DashboardPageShell>
  );
}

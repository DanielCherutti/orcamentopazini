import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listProductGroupsAction, getProductGroupProductsAction } from "@/actions/product-group-actions";
import { ProductGroupsTable } from "@/components/products/groups/product-groups-table";

export const metadata: Metadata = {
  title: "Grupos de Produtos",
};

export default async function ProductGroupsPage() {
  const res = await listProductGroupsAction();
  const groups = res.data ?? [];

  // Count products per group
  const productCounts: Record<string, number> = {};
  await Promise.all(
    groups.map(async (group) => {
      const prodsRes = await getProductGroupProductsAction(group.id);
      productCounts[group.id] = prodsRes.data?.length ?? 0;
    })
  );

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Grupos de Produtos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie os grupos para organizar o catálogo de produtos
          </p>
        </div>
        <Button asChild className="rounded-sm">
          <Link href="/dashboard/products/groups/new">
            <Plus className="mr-2 h-4 w-4" />
            Novo Grupo
          </Link>
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm p-6">
        <ProductGroupsTable groups={groups} productCounts={productCounts} />
      </div>
    </div>
  );
}

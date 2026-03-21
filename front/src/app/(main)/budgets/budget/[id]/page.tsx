import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBudgetAction, syncDraftPricesAction } from "@/actions/budget-actions";
import { BudgetWorkspace } from "@/components/budgets/budget-workspace";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "Orçamento",
};

export default async function BudgetPage(props: PageProps) {
  const params = await props.params;
  const id = params.id;

  const initial = await getBudgetAction(id);

  if (!initial.success || !initial.data) {
    notFound();
  }

  let budget = initial.data;

  // Sincroniza preços dos itens com o catálogo para orçamentos em rascunho
  if (budget.status === "draft") {
    const syncResult = await syncDraftPricesAction(id);
    if (syncResult.updatedCount > 0) {
      const refreshed = await getBudgetAction(id);
      if (refreshed.success && refreshed.data) {
        budget = refreshed.data;
      }
    }
  }

  return (
    <Suspense fallback={<EditorSkeleton />}>
      <BudgetWorkspace initialBudget={budget} mode="edit" />
    </Suspense>
  );
}

function EditorSkeleton() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="border-b p-4 flex items-center justify-between bg-card">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
      <div className="flex-1 p-6 space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

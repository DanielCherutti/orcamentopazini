import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getProductGroupAction } from "@/actions/product-group-actions";
import { EditProductGroupForm } from "@/components/products/groups/edit-product-group-form";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const res = await getProductGroupAction(decodeURIComponent(id));
  return {
    title: res.data?.name ? `Editar ${res.data.name}` : "Editar Grupo",
  };
}

export default async function EditProductGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);

  const res = await getProductGroupAction(id);

  if (!res.success || !res.data) {
    notFound();
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" className="rounded-sm h-9 w-9" asChild>
          <Link href="/dashboard/products/groups">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Editar Grupo</h1>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm p-6">
        <EditProductGroupForm group={res.data} />
      </div>
    </div>
  );
}

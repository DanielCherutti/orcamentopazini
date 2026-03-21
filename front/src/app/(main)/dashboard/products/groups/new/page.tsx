"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createProductGroupAction } from "@/actions/product-group-actions";
import { ProductGroupForm } from "@/components/products/groups/product-group-form";
import { toast } from "@/lib/toast";

export default function NewProductGroupPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState("");

  const handleSubmit = async (formData: FormData) => {
    setGeneralError("");
    setIsSubmitting(true);
    try {
      const res = await createProductGroupAction(formData);
      if (res.success) {
        toast.success("Grupo criado com sucesso!");
        router.push("/dashboard/products/groups");
        router.refresh();
      } else {
        setGeneralError(res.error ?? "Erro ao criar grupo");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" className="rounded-sm h-9 w-9" asChild>
          <Link href="/dashboard/products/groups">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Novo Grupo de Produtos</h1>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm p-6">
        <ProductGroupForm
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          submitLabel="Criar grupo"
          generalError={generalError}
        />
      </div>
    </div>
  );
}

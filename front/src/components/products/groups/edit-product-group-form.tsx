"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProductGroupAction, type ProductGroup } from "@/actions/product-group-actions";
import { ProductGroupForm } from "./product-group-form";
import { toast } from "@/lib/toast";

export function EditProductGroupForm({ group }: { group: ProductGroup }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState("");

  const handleSubmit = async (formData: FormData) => {
    setGeneralError("");
    setIsSubmitting(true);
    try {
      const res = await updateProductGroupAction(group.id, formData);
      if (res.success) {
        toast.success("Grupo atualizado com sucesso!");
        router.push("/dashboard/products/groups");
        router.refresh();
      } else {
        setGeneralError(res.error ?? "Erro ao atualizar grupo");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ProductGroupForm
      initialName={group.name}
      initialImageUrl={group.image_url}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Salvar alterações"
      generalError={generalError}
    />
  );
}

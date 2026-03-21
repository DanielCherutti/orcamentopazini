
"use client";

import { updateProductAction, deleteProductAction, Product } from "@/actions/product-actions";
import { ProductForm } from "@/components/products/product-form";
import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function EditProductForm({ product }: { product: Product }) {
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
    const [generalError, setGeneralError] = useState("");
    const router = useRouter();

    const handleUpdate = async (formData: FormData) => {
        setFieldErrors({});
        setGeneralError("");
        if (!product.id) return;

        const res = await updateProductAction(product.id, formData);
        if (res.success) {
            toast.success("Produto atualizado com sucesso!");
            router.push("/dashboard/products");
            router.refresh();
        } else {
            console.error("Update failed:", res);
            if (res.error) setGeneralError(res.error);
            if (res.fieldErrors) setFieldErrors(res.fieldErrors);
        }
    };

    const handleDelete = async () => {
        if (!product.id) return;
        const res = await deleteProductAction(product.id);
        if (res.success) {
            toast.success("Produto excluído com sucesso!");
            router.push("/dashboard/products");
            router.refresh();
        } else {
            toast.error(res.error || "Erro ao excluir");
        }
    };

    return (
        <ProductForm
            key={product.id}
            initialData={product}
            action={handleUpdate}
            onDelete={handleDelete}
            errors={fieldErrors}
            generalError={generalError}
        />
    );
}


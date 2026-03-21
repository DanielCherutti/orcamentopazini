"use client";

import { createProductAction, getNextProductCodeAction } from "@/actions/product-actions";
import { ProductForm } from "@/components/products/product-form";
import { useState, useEffect } from "react";
import { toast } from "@/lib/toast";

export default function NewProductPage() {
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
    const [generalError, setGeneralError] = useState("");
    const [nextCode, setNextCode] = useState("");

    useEffect(() => {
        getNextProductCodeAction().then((res) => {
            if (res.success && res.data) setNextCode(res.data);
        });
    }, []);

    const handleAction = async (formData: FormData) => {
        setFieldErrors({});
        setGeneralError("");
        try {
            const res = await createProductAction(formData);
            if (res.success) {
                toast.success("Produto criado com sucesso!");
                // Force a hard refresh/navigation to ensure list is updated
                window.location.href = "/dashboard/products";
            } else {
                console.error("Product creation failed:", res.error);
                setGeneralError(res.error || "Erro ao criar produto");
                if (res.fieldErrors) {
                    setFieldErrors(res.fieldErrors);
                }
            }
        } catch (err) {
            console.error("Unexpected error submitting form:", err);
            setGeneralError("Erro inesperado ao salvar o produto.");
        }
    };

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight">Novo Produto</h1>
            </div>

            <ProductForm
                defaultCode={nextCode}
                action={handleAction}
                errors={fieldErrors}
                generalError={generalError}
            />
        </div>
    );
}

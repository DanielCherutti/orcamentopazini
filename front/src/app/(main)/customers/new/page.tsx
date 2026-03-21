"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCustomerAction, type CustomerFormInput } from "@/actions/client-actions";
import { CustomerForm } from "@/components/clients/customer-form";
import { toast } from "@/lib/toast";

export default function NewCustomerPage() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
    const [generalError, setGeneralError] = useState("");

    const handleCreate = async (data: CustomerFormInput) => {
        setIsSubmitting(true);
        setFieldErrors({});
        setGeneralError("");
        try {
            const res = await createCustomerAction(data);
            if (res.success) {
                toast.success("Cliente criado com sucesso!");
                router.push("/customers");
            } else {
                setGeneralError(res.error || "Erro ao criar cliente");
                if (res.fieldErrors) setFieldErrors(res.fieldErrors);
            }
        } catch {
            setGeneralError("Erro inesperado ao salvar o cliente.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight">Novo Cliente</h1>
            </div>

            <CustomerForm
                onSubmit={handleCreate}
                isSubmitting={isSubmitting}
                fieldErrors={fieldErrors}
                generalError={generalError}
            />
        </div>
    );
}

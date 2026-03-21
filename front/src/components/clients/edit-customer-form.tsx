"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCustomerAction, deleteCustomerAction, type CustomerFull, type CustomerFormInput } from "@/actions/client-actions";
import { CustomerForm } from "./customer-form";
import { toast } from "@/lib/toast";

interface EditCustomerFormProps {
    customer: CustomerFull;
}

export function EditCustomerForm({ customer }: EditCustomerFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
    const [generalError, setGeneralError] = useState("");

    const handleUpdate = async (data: CustomerFormInput) => {
        setIsSubmitting(true);
        setFieldErrors({});
        setGeneralError("");
        try {
            const res = await updateCustomerAction(customer.id, data);
            if (res.success) {
                toast.success("Cliente atualizado com sucesso!");
                router.push("/customers");
            } else {
                setGeneralError(res.error || "Erro ao atualizar cliente");
                if (res.fieldErrors) setFieldErrors(res.fieldErrors);
            }
        } catch {
            setGeneralError("Erro inesperado ao salvar o cliente.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        const res = await deleteCustomerAction(customer.id);
        if (res.success) {
            toast.success("Cliente excluído com sucesso!");
            router.push("/customers");
        } else {
            toast.error(res.error || "Erro ao excluir cliente");
        }
    };

    return (
        <CustomerForm
            initialData={customer}
            onSubmit={handleUpdate}
            onDelete={handleDelete}
            isSubmitting={isSubmitting}
            fieldErrors={fieldErrors}
            generalError={generalError}
        />
    );
}

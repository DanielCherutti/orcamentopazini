"use client";

import { useRouter } from "next/navigation";
import {
    createDatabookTemplateAction,
    deleteDatabookTemplateAction,
    updateDatabookTemplateAction,
} from "@/actions/databook-template-actions";
import { DatabookTemplateForm } from "@/components/databooks/databook-template-form";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import type { DatabookTemplate } from "@/types/databook-template-types";
import { useState } from "react";
import { useConfirmDialog } from "@/components/providers/confirm-dialog-provider";

export function NewDatabookForm() {
    const router = useRouter();
    const [error, setError] = useState("");

    const handleAction = async (formData: FormData) => {
        setError("");
        const res = await createDatabookTemplateAction(formData);
        if (res.success && res.id) {
            toast.success("DataBook criado");
            router.push(`/dashboard/databooks/${encodeURIComponent(res.id)}`);
        } else {
            setError(res.error || "Erro ao criar");
        }
    };

    return <DatabookTemplateForm action={handleAction} generalError={error} />;
}

export function EditDatabookForm({ template }: { template: DatabookTemplate }) {
    const router = useRouter();
    const confirm = useConfirmDialog();
    const [error, setError] = useState("");

    const handleAction = async (formData: FormData) => {
        setError("");
        const res = await updateDatabookTemplateAction(template.id!, formData);
        if (res.success) {
            toast.success("DataBook salvo");
            router.refresh();
        } else {
            setError(res.error || "Erro ao salvar");
        }
    };

    const handleDelete = async () => {
        const ok = await confirm({
            title: "Excluir DataBook",
            description: `Excluir "${template.name}"? Projetos já criados não serão afetados.`,
            confirmLabel: "Excluir",
            destructive: true,
        });
        if (!ok) return;
        const res = await deleteDatabookTemplateAction(template.id!);
        if (res.success) {
            toast.success("DataBook excluído");
            router.push("/dashboard/databooks");
        } else {
            toast.error(res.error || "Não foi possível excluir");
        }
    };

    return (
        <div className="space-y-4">
            <DatabookTemplateForm
                initialData={template}
                action={handleAction}
                generalError={error}
            />
            {!template.is_default ? (
                <div className="flex justify-start">
                    <Button type="button" variant="destructive" size="sm" onClick={handleDelete}>
                        Excluir DataBook
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    createTechnicalEquipmentAction,
    updateTechnicalEquipmentAction,
    type TechnicalEquipment,
} from "@/actions/technical-equipment-actions";
import { TechnicalEquipmentForm } from "@/components/technical-equipment/technical-equipment-form";
import { toast } from "@/lib/toast";

export function EditTechnicalEquipmentForm({ equipment }: { equipment: TechnicalEquipment }) {
    const router = useRouter();
    const [generalError, setGeneralError] = useState("");

    const handleAction = async (formData: FormData) => {
        setGeneralError("");
        const res = await updateTechnicalEquipmentAction(equipment.id!, formData);
        if (res.success) {
            toast.success("Equipamento atualizado");
            router.refresh();
        } else {
            setGeneralError(res.error || "Erro ao salvar");
        }
    };

    return (
        <TechnicalEquipmentForm
            initialData={equipment}
            action={handleAction}
            generalError={generalError}
        />
    );
}

export function NewTechnicalEquipmentForm({
    defaultCode,
}: {
    defaultCode: string;
}) {
    const router = useRouter();
    const [generalError, setGeneralError] = useState("");

    const handleAction = async (formData: FormData) => {
        setGeneralError("");
        const res = await createTechnicalEquipmentAction(formData);
        if (res.success && res.id) {
            toast.success("Equipamento criado");
            router.push(`/dashboard/technical-equipment/${encodeURIComponent(res.id)}`);
        } else {
            setGeneralError(res.error || "Erro ao criar");
        }
    };

    return (
        <TechnicalEquipmentForm
            defaultCode={defaultCode}
            action={handleAction}
            generalError={generalError}
        />
    );
}

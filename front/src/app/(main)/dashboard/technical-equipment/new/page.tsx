import type { Metadata } from "next";
import { getNextTechnicalEquipmentCodeAction } from "@/actions/technical-equipment-actions";
import { NewTechnicalEquipmentForm } from "../technical-equipment-forms";

export const metadata: Metadata = {
    title: "Novo equipamento técnico",
};

export default async function NewTechnicalEquipmentPage() {
    const codeRes = await getNextTechnicalEquipmentCodeAction();
    const defaultCode = codeRes.data ?? "EQ-0001";

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            <h1 className="text-2xl font-bold tracking-tight">Novo equipamento técnico</h1>
            <NewTechnicalEquipmentForm defaultCode={defaultCode} />
        </div>
    );
}

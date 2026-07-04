import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTechnicalEquipmentAction } from "@/actions/technical-equipment-actions";
import { EditTechnicalEquipmentForm } from "../technical-equipment-forms";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<Metadata> {
    const { id } = await params;
    const res = await getTechnicalEquipmentAction(decodeURIComponent(id));
    return {
        title: res.data?.code ? `Editar ${res.data.code}` : "Editar equipamento",
    };
}

export default async function EditTechnicalEquipmentPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id: rawId } = await params;
    const res = await getTechnicalEquipmentAction(decodeURIComponent(rawId));
    if (!res.success || !res.data) notFound();

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            <h1 className="text-2xl font-bold tracking-tight">Editar equipamento técnico</h1>
            <EditTechnicalEquipmentForm equipment={res.data} />
        </div>
    );
}

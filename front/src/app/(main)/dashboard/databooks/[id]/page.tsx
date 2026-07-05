import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDatabookTemplateAction } from "@/actions/databook-template-actions";
import { EditDatabookForm } from "../databook-forms";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<Metadata> {
    const { id } = await params;
    const res = await getDatabookTemplateAction(decodeURIComponent(id));
    return { title: res.data?.name ?? "Editar DataBook" };
}

export default async function EditDatabookPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id: rawId } = await params;
    const res = await getDatabookTemplateAction(decodeURIComponent(rawId));
    if (!res.success || !res.data) notFound();

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6">
            <h1 className="text-2xl font-bold tracking-tight">Editar DataBook</h1>
            <EditDatabookForm template={res.data} />
        </div>
    );
}

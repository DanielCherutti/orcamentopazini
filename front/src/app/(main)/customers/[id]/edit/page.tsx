import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCustomerAction } from "@/actions/client-actions";
import { EditCustomerForm } from "@/components/clients/edit-customer-form";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<Metadata> {
    const { id } = await params;
    const { data: customer } = await getCustomerAction(id);
    return {
        title: customer?.name ? `Editar ${customer.name}` : "Editar Cliente",
    };
}

export default async function EditCustomerPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const result = await getCustomerAction(id);

    if (!result.success || !result.data) {
        notFound();
    }

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight">Editar Cliente</h1>
            </div>

            <EditCustomerForm customer={result.data} />
        </div>
    );
}

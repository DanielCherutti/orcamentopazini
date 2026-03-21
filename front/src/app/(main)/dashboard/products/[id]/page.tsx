import type { Metadata } from "next";
import { getProductAction } from "@/actions/product-actions";
import { EditProductForm } from "./edit-product-form";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id: rawId } = await params;
    const id = decodeURIComponent(rawId);
    const { data: product } = await getProductAction(id);
    return {
        title: product?.code ? `Editar ${product.code}` : "Editar Produto",
    };
}

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: rawId } = await params;
    const id = decodeURIComponent(rawId);
    const { data: product } = await getProductAction(id);

    if (!product) {
        notFound();
    }

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight">Editar Produto</h1>
            </div>

            <EditProductForm product={product} />
        </div>
    );
}

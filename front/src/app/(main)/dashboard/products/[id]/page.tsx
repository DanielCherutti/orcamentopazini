import type { Metadata } from "next";
import { getProductAction } from "@/actions/product-actions";
import { EditProductForm } from "./edit-product-form";
import { notFound } from "next/navigation";
import {
    getProductDatabookConfigAction,
    listProductManualsAction,
} from "@/actions/product-databook-actions";

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
    const [{ data: product }, configResult, manualsResult] = await Promise.all([
        getProductAction(id),
        getProductDatabookConfigAction(id),
        listProductManualsAction(id),
    ]);

    if (!product) {
        notFound();
    }

    return (
        <div className="w-full max-w-none space-y-6 px-4 py-6 md:px-6 xl:px-8">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight">Editar Produto</h1>
            </div>

            <EditProductForm
                product={product}
                databookConfig={configResult.success ? configResult.data : undefined}
                manuals={manualsResult.data ?? []}
            />
        </div>
    );
}

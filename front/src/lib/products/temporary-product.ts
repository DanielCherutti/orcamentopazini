import { z } from "zod";
import { isValidNcm } from "@/lib/products/ncm";
import type { BudgetItem } from "@/types/budget-types";

export const temporaryProductInputSchema = z.object({
    code: z.string().trim().optional(),
    ncm: z.string().refine(isValidNcm, "O NCM deve conter exatamente 8 dígitos"),
    description: z.string().trim().min(1, "A descrição é obrigatória"),
    unit: z.string().trim().min(1, "A unidade é obrigatória"),
    equipmentPrice: z.number().min(0, "O preço não pode ser negativo"),
    assemblyPrice: z.number().min(0).default(0),
    assemblyPriceType: z.enum(["fixed", "percentage"]).default("fixed"),
    assemblyPricePercentage: z.number().nullable().optional(),
    detailedDescription: z.string().optional(),
    imageUrl: z.string().optional(),
});

export type TemporaryProductInput = z.infer<typeof temporaryProductInputSchema>;

export function generateTemporaryProductCode(): string {
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    return `TMP-${suffix}`;
}

export function resolveAssemblyPrice(input: TemporaryProductInput): number {
    if (input.assemblyPriceType === "percentage") {
        const pct = input.assemblyPricePercentage ?? 0;
        return (input.equipmentPrice * pct) / 100;
    }
    return input.assemblyPrice ?? 0;
}

/** Reconstrói o formulário a partir do produto carregado e do snapshot da linha do orçamento. */
export function temporaryProductInputFromBudgetItem(item: BudgetItem): TemporaryProductInput {
    const row = item as unknown as Record<string, unknown>;
    const productData =
        row.product_data && typeof row.product_data === "object"
            ? (row.product_data as Record<string, unknown>)
            : typeof row.product_id === "object" && row.product_id !== null
              ? (row.product_id as Record<string, unknown>)
              : {};
    const assemblyPriceType =
        productData.assemblyPriceType === "percentage" ? "percentage" : "fixed";

    return {
        code: String(productData.code ?? row.product_code ?? "").trim(),
        ncm: String(productData.ncm ?? row.product_ncm ?? "").trim(),
        description: String(
            productData.description ?? productData.name ?? row.product_name ?? "",
        ).trim(),
        unit: String(productData.unit ?? row.product_unit ?? "").trim(),
        equipmentPrice: Number(productData.equipmentPrice ?? item.unit_price ?? 0),
        assemblyPrice: Number(productData.assemblyPrice ?? item.labor_cost ?? 0),
        assemblyPriceType,
        assemblyPricePercentage:
            assemblyPriceType === "percentage"
                ? Number(productData.assemblyPricePercentage ?? 0)
                : null,
        detailedDescription: String(productData.detailedDescription ?? ""),
        imageUrl: String(productData.imageUrl ?? productData.image_url ?? ""),
    };
}

export function parseTemporaryProductInput(raw: unknown):
    | { ok: true; data: TemporaryProductInput }
    | { ok: false; error: string; fieldErrors?: Record<string, string[]> } {
    const parsed = temporaryProductInputSchema.safeParse(raw);
    if (!parsed.success) {
        return {
            ok: false,
            error: "Dados inválidos",
            fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
        };
    }
    return { ok: true, data: parsed.data };
}

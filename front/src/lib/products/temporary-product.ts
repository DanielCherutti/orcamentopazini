import { z } from "zod";

export const temporaryProductInputSchema = z.object({
    code: z.string().trim().optional(),
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

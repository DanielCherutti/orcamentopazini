import type { BudgetPackageExportMode } from "@/lib/budgets/budget-package-constants";

export type BudgetPackageManifestV1 = {
    version: 1;
    exportedAt: string;
    /** Modo usado na exportação (import sabe se deve copiar arquivos). */
    exportMode?: BudgetPackageExportMode;
    sourceBudgetId: string;
    sourceBudgetCode?: string;
    budget: Record<string, unknown>;
    client: Record<string, unknown> | null;
    products: Array<Record<string, unknown>>;
    blocks: Array<Record<string, unknown>>;
    locations: Array<Record<string, unknown>>;
    sections: Array<Record<string, unknown>>;
    items: Array<Record<string, unknown>>;
    images: Array<Record<string, unknown>>;
    annotations: Array<Record<string, unknown>>;
};

export function isBudgetPackageManifestV1(data: unknown): data is BudgetPackageManifestV1 {
    if (!data || typeof data !== "object") return false;
    const m = data as Record<string, unknown>;
    return (
        m.version === 1 &&
        typeof m.exportedAt === "string" &&
        typeof m.sourceBudgetId === "string" &&
        m.budget != null &&
        typeof m.budget === "object" &&
        Array.isArray(m.blocks) &&
        Array.isArray(m.locations) &&
        Array.isArray(m.sections) &&
        Array.isArray(m.items) &&
        Array.isArray(m.images) &&
        Array.isArray(m.annotations) &&
        (m.products == null || Array.isArray(m.products))
    );
}

/** Normaliza manifest lido do ZIP/JSON antes da importação. */
export function normalizeBudgetPackageManifest(data: unknown): BudgetPackageManifestV1 | null {
    if (!isBudgetPackageManifestV1(data)) return null;
    return {
        ...data,
        products: Array.isArray(data.products) ? data.products : [],
        client: data.client ?? null,
    };
}

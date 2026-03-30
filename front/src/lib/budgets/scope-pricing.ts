export type PriceAdjustmentMode = "percent" | "fixed";
export type LocationAssemblyMode = "percent" | "fixed" | "manual";
export type CostDisplayMode = "location" | "section" | "general";

export type ScopePricingItem = {
    id?: string;
    quantity?: number;
    unit_price?: number;
    labor_cost?: number;
    price_adjustment_mode?: PriceAdjustmentMode | null;
    price_adjustment_value?: number;
    observation_extra_value?: number;
    assembly_manual_value?: number;
};

export function normalizeMoney(value: unknown): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
}

export function normalizeQty(value: unknown): number {
    const n = Number(value ?? 1);
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.floor(n);
}

export function computeItemBaseTotal(item: ScopePricingItem): number {
    const qty = normalizeQty(item.quantity);
    const unit = normalizeMoney(item.unit_price);
    const labor = normalizeMoney(item.labor_cost);
    return (unit + labor) * qty;
}

export function computeItemAdjustmentValue(item: ScopePricingItem): number {
    const base = computeItemBaseTotal(item);
    const mode = item.price_adjustment_mode ?? null;
    const raw = normalizeMoney(item.price_adjustment_value);
    if (mode === "percent") return base * (raw / 100);
    if (mode === "fixed") return raw;
    return 0;
}

export function computeItemSubtotal(item: ScopePricingItem): number {
    const base = computeItemBaseTotal(item);
    const adjustment = computeItemAdjustmentValue(item);
    const observationExtra = normalizeMoney(item.observation_extra_value);
    return base + adjustment + observationExtra;
}

export function computeLocationAssemblyTotal(
    mode: LocationAssemblyMode,
    assemblyValue: number,
    items: ScopePricingItem[]
): number {
    const val = normalizeMoney(assemblyValue);
    if (mode === "manual") {
        return items.reduce((sum, item) => sum + normalizeMoney(item.assembly_manual_value), 0);
    }
    if (mode === "percent") {
        const subtotal = items.reduce((sum, item) => sum + computeItemSubtotal(item), 0);
        return subtotal * (val / 100);
    }
    return val;
}

export function distributeProportional(
    items: ScopePricingItem[],
    totalToDistribute: number
): Record<string, number> {
    const grand = normalizeMoney(totalToDistribute);
    const byId: Record<string, number> = {};
    const withId = items.filter((item): item is ScopePricingItem & { id: string } => !!item.id);
    if (withId.length === 0) return byId;

    const weights = withId.map((item) => Math.max(0, computeItemSubtotal(item)));
    const weightSum = weights.reduce((a, b) => a + b, 0);
    if (weightSum <= 0) {
        withId.forEach((item) => {
            byId[item.id] = 0;
        });
        return byId;
    }

    let allocated = 0;
    for (let i = 0; i < withId.length; i++) {
        const item = withId[i];
        if (i === withId.length - 1) {
            byId[item.id] = grand - allocated;
            break;
        }
        const rawShare = grand * (weights[i] / weightSum);
        const rounded = Math.round(rawShare * 100) / 100;
        byId[item.id] = rounded;
        allocated += rounded;
    }
    return byId;
}

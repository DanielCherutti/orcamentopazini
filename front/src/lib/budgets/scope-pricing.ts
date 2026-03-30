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

/**
 * Total do escopo de um único local (todos os trechos), alinhado a `recalculateBudgetTotal`
 * (montagem por trecho vs. fallback do local).
 */
export function computeLocationScopeTotal(params: {
    location: {
        assembly_mode?: LocationAssemblyMode | string;
        assembly_value?: number;
    };
    sections: Array<{
        id: string;
        assembly_mode?: "percent" | "fixed" | "manual";
        assembly_value?: number;
    }>;
    items: Array<ScopePricingItem & { section_id: string }>;
}): number {
    const locModeRaw = String(params.location.assembly_mode ?? "percent");
    const locMode: LocationAssemblyMode =
        locModeRaw === "fixed" || locModeRaw === "manual" ? locModeRaw : "percent";
    const locValue = normalizeMoney(params.location.assembly_value);

    const sectionConfig = new Map<
        string,
        { mode: LocationAssemblyMode; value: number; hasOwnAssembly: boolean }
    >();
    const sectionIds: string[] = [];
    for (const row of params.sections) {
        const sectionId = row.id;
        sectionIds.push(sectionId);
        const hasOwnAssembly = row.assembly_mode != null || row.assembly_value != null;
        const modeRaw = String(row.assembly_mode ?? "percent");
        const mode: LocationAssemblyMode =
            modeRaw === "fixed" || modeRaw === "manual" ? modeRaw : "percent";
        const value = Number(row.assembly_value ?? 0);
        sectionConfig.set(sectionId, { mode, value, hasOwnAssembly });
    }

    const itemsByLocationFallback: ScopePricingItem[] = [];
    const itemsBySection = new Map<string, ScopePricingItem[]>();
    for (const row of params.items) {
        const sectionId = row.section_id;
        const item: ScopePricingItem = {
            id: row.id,
            quantity: row.quantity,
            unit_price: row.unit_price,
            labor_cost: row.labor_cost,
            price_adjustment_mode: row.price_adjustment_mode ?? null,
            price_adjustment_value: row.price_adjustment_value,
            observation_extra_value: row.observation_extra_value,
            assembly_manual_value: row.assembly_manual_value,
        };
        const secCfg = sectionConfig.get(sectionId);
        if (secCfg?.hasOwnAssembly) {
            const sectionItems = itemsBySection.get(sectionId) ?? [];
            sectionItems.push(item);
            itemsBySection.set(sectionId, sectionItems);
            continue;
        }
        itemsByLocationFallback.push(item);
    }

    let grandTotal = 0;
    for (const [sectionId, cfg] of sectionConfig.entries()) {
        if (!cfg.hasOwnAssembly) continue;
        const items = itemsBySection.get(sectionId) ?? [];
        const itemSubtotal = items.reduce((sum, item) => sum + computeItemSubtotal(item), 0);
        const assemblyTotal = computeLocationAssemblyTotal(cfg.mode, cfg.value, items);
        grandTotal += itemSubtotal + assemblyTotal;
    }

    const itemSubtotalFallback = itemsByLocationFallback.reduce(
        (sum, item) => sum + computeItemSubtotal(item),
        0
    );
    const assemblyFallback = computeLocationAssemblyTotal(locMode, locValue, itemsByLocationFallback);
    grandTotal += itemSubtotalFallback + assemblyFallback;

    for (const [sectionId, cfg] of sectionConfig.entries()) {
        if (!cfg.hasOwnAssembly) continue;
        if (itemsBySection.has(sectionId)) continue;
        grandTotal += computeLocationAssemblyTotal(cfg.mode, cfg.value, []);
    }

    const hasFallbackItems = itemsByLocationFallback.length > 0;
    if (!hasFallbackItems) {
        const hasAnyFallbackSection = sectionIds.some(
            (sid) => !sectionConfig.get(sid)?.hasOwnAssembly
        );
        if (hasAnyFallbackSection) {
            grandTotal += computeLocationAssemblyTotal(locMode, locValue, []);
        }
    }

    return grandTotal;
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

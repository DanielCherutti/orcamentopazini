import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { safeStringRecordId } from "@/lib/surreal-record-ids";
import {
    computeItemSubtotal,
    computeLocationAssemblyTotal,
    type LocationAssemblyMode,
    type ScopePricingItem,
} from "@/lib/budgets/scope-pricing";

/**
 * Monta o conteúdo de uma nova linha `budget_item` a partir de uma existente (duplicação).
 * Preserva ordem e blocos de grupo (`order_index`, `group_id`/`group_name`/`group_instance_id` e textos do produto).
 */
export function buildDuplicatedBudgetItemContent(item: Record<string, unknown>): Record<string, unknown> {
    const orderRaw = item.order_index;
    let orderIndex = 0;
    if (typeof orderRaw === "number" && !Number.isNaN(orderRaw)) {
        orderIndex = orderRaw;
    } else if (typeof orderRaw === "string" && !Number.isNaN(Number(orderRaw))) {
        orderIndex = Number(orderRaw);
    }

    const content: Record<string, unknown> = {
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        labor_cost: item.labor_cost ?? 0,
        total: item.total,
        order_index: orderIndex,
        created_at: new Date().toISOString(),
    };

    if (item.group_id != null) content.group_id = item.group_id;
    if (item.group_name != null) content.group_name = item.group_name;
    if (item.group_instance_id != null) content.group_instance_id = item.group_instance_id;
    if (item.product_name != null) content.product_name = item.product_name;
    if (item.product_unit != null) content.product_unit = item.product_unit;
    if (item.notes != null) content.notes = item.notes;
    if (item.observation_text != null) content.observation_text = item.observation_text;
    if (item.observation_show_on_print != null) {
        content.observation_show_on_print = item.observation_show_on_print;
    }
    if (item.labor_show_on_print != null) {
        content.labor_show_on_print = item.labor_show_on_print;
    }
    if (item.observation_extra_value != null) {
        content.observation_extra_value = item.observation_extra_value;
    }
    if (item.price_adjustment_mode != null) content.price_adjustment_mode = item.price_adjustment_mode;
    if (item.price_adjustment_value != null) content.price_adjustment_value = item.price_adjustment_value;
    if (item.assembly_manual_value != null) content.assembly_manual_value = item.assembly_manual_value;

    return content;
}

/** Extrai product_id como string para lookup (suporta RecordId, string, objeto) */
export function extractProductId(pid: unknown): string | null {
    if (!pid) return null;
    if (typeof pid === "string" && pid.length > 0) return pid;
    if (typeof pid === "object" && pid !== null) {
        const o = pid as Record<string, unknown>;
        if (o.id != null) return String(o.id);
        if (typeof (pid as { toString?: () => string }).toString === "function") {
            const s = (pid as { toString: () => string }).toString();
            if (s && !s.startsWith("[object")) return s;
        }
    }
    return null;
}

export async function recalculateBudgetTotal(budgetId: string) {
    const db = await getDb();
    try {
        const budgetRecordId = safeStringRecordId("budget", budgetId);
        if (!budgetRecordId) return;

        const [locRowsRes, secRowsRes, itemRowsRes] = await Promise.all([
            db.query<[Array<{ id: unknown; assembly_mode?: unknown; assembly_value?: unknown }>]>(
                `SELECT id, assembly_mode, assembly_value FROM budget_location WHERE budget_id = $budgetId AND deleted_at IS NONE`,
                { budgetId: budgetRecordId }
            ),
            db.query<
                [
                    Array<{
                        id: unknown;
                        location_id?: unknown;
                        assembly_mode?: unknown;
                        assembly_value?: unknown;
                    }>,
                ]
            >(
                `SELECT id, location_id, assembly_mode, assembly_value
                 FROM budget_section
                 WHERE budget_id = $budgetId AND deleted_at IS NONE`,
                { budgetId: budgetRecordId }
            ),
            db.query<[Array<Record<string, unknown>>]>(
                `SELECT id, section_id, quantity, unit_price, labor_cost, price_adjustment_mode, price_adjustment_value, observation_extra_value, assembly_manual_value
                 FROM budget_item WHERE section_id.budget_id = $budgetId AND deleted_at IS NONE FETCH section_id`,
                { budgetId: budgetRecordId }
            ),
        ]);

        const locationConfig = new Map<
            string,
            { mode: LocationAssemblyMode; value: number }
        >();
        for (const row of locRowsRes[0] ?? []) {
            const id = String(row.id);
            const modeRaw = String(row.assembly_mode ?? "percent");
            const mode: LocationAssemblyMode =
                modeRaw === "fixed" || modeRaw === "manual" ? modeRaw : "percent";
            locationConfig.set(id, {
                mode,
                value: Number(row.assembly_value ?? 0),
            });
        }

        const sectionConfig = new Map<
            string,
            {
                locationId: string;
                mode: LocationAssemblyMode;
                value: number;
                hasOwnAssembly: boolean;
            }
        >();
        const sectionIdsByLocation = new Map<string, string[]>();
        for (const row of secRowsRes[0] ?? []) {
            const sectionId = String(row.id);
            const locationId = String(row.location_id ?? "");
            if (!locationId) continue;
            const modeRaw = String(row.assembly_mode ?? "percent");
            const mode: LocationAssemblyMode =
                modeRaw === "fixed" || modeRaw === "manual" ? modeRaw : "percent";
            const value = Number(row.assembly_value ?? 0);
            const hasOwnAssembly = row.assembly_mode != null || row.assembly_value != null;
            sectionConfig.set(sectionId, {
                locationId,
                mode,
                value,
                hasOwnAssembly,
            });
            const locSections = sectionIdsByLocation.get(locationId) ?? [];
            locSections.push(sectionId);
            sectionIdsByLocation.set(locationId, locSections);
        }

        const itemsByLocationFallback = new Map<string, ScopePricingItem[]>();
        const itemsBySection = new Map<string, ScopePricingItem[]>();
        for (const row of itemRowsRes[0] ?? []) {
            const section = row.section_id as Record<string, unknown> | undefined;
            const sectionIdRaw = section && typeof section === "object" ? section.id : undefined;
            if (!sectionIdRaw) continue;
            const sectionId = String(sectionIdRaw);
            const locationRaw =
                section && typeof section === "object" ? section.location_id : undefined;
            if (!locationRaw) continue;
            const locationId = String(locationRaw);
            const item: ScopePricingItem = {
                id: String(row.id ?? ""),
                quantity: Number(row.quantity ?? 1),
                unit_price: Number(row.unit_price ?? 0),
                labor_cost: Number(row.labor_cost ?? 0),
                price_adjustment_mode:
                    row.price_adjustment_mode === "percent" || row.price_adjustment_mode === "fixed"
                        ? row.price_adjustment_mode
                        : null,
                price_adjustment_value: Number(row.price_adjustment_value ?? 0),
                observation_extra_value: Number(row.observation_extra_value ?? 0),
                assembly_manual_value: Number(row.assembly_manual_value ?? 0),
            };
            const secCfg = sectionConfig.get(sectionId);
            if (secCfg?.hasOwnAssembly) {
                const sectionItems = itemsBySection.get(sectionId) ?? [];
                sectionItems.push(item);
                itemsBySection.set(sectionId, sectionItems);
                continue;
            }
            const locItems = itemsByLocationFallback.get(locationId) ?? [];
            locItems.push(item);
            itemsByLocationFallback.set(locationId, locItems);
        }

        let grandTotal = 0;
        for (const [sectionId, cfg] of sectionConfig.entries()) {
            if (!cfg.hasOwnAssembly) continue;
            const items = itemsBySection.get(sectionId) ?? [];
            const itemSubtotal = items.reduce((sum, item) => sum + computeItemSubtotal(item), 0);
            const assemblyTotal = computeLocationAssemblyTotal(cfg.mode, cfg.value, items);
            grandTotal += itemSubtotal + assemblyTotal;
        }

        for (const [locationId, items] of itemsByLocationFallback.entries()) {
            const itemSubtotal = items.reduce((sum, item) => sum + computeItemSubtotal(item), 0);
            const cfg = locationConfig.get(locationId) ?? { mode: "percent", value: 0 };
            const assemblyTotal = computeLocationAssemblyTotal(cfg.mode, cfg.value, items);
            grandTotal += itemSubtotal + assemblyTotal;
        }

        for (const [sectionId, cfg] of sectionConfig.entries()) {
            if (!cfg.hasOwnAssembly) continue;
            if (itemsBySection.has(sectionId)) continue;
            const assemblyTotal = computeLocationAssemblyTotal(cfg.mode, cfg.value, []);
            grandTotal += assemblyTotal;
        }

        for (const [locationId, cfg] of locationConfig.entries()) {
            const hasFallbackItems = itemsByLocationFallback.has(locationId);
            if (hasFallbackItems) continue;
            const locationSections = sectionIdsByLocation.get(locationId) ?? [];
            const hasAnyFallbackSection = locationSections.some(
                (sid) => !sectionConfig.get(sid)?.hasOwnAssembly
            );
            if (!hasAnyFallbackSection) continue;
            const assemblyTotal = computeLocationAssemblyTotal(cfg.mode, cfg.value, []);
            grandTotal += assemblyTotal;
        }

        await db.update(budgetRecordId).merge({
            total_value: grandTotal,
            updated_at: new Date().toISOString(),
        });
    } catch (e) {
        console.error("Failed to recalculate budget total", e);
        if (isTokenExpiredError(e)) resetDb();
    }
}

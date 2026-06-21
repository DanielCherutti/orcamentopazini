"use server";

import { revalidatePath } from "next/cache";
import { StringRecordId, Table } from "surrealdb";
import { assertWriteActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { budgetRevalidatePath } from "@/lib/budgets/budget-path";
import { serializeBudgetEntity } from "@/actions/budget-shared";
import {
    InvalidRecordIdError,
    requireRecordId,
    canonicalTableRecordId,
} from "@/lib/surreal-record-ids";
import { buildDuplicatedBudgetItemContent, recalculateBudgetTotal } from "@/actions/budget-hierarchy-helpers";
import type { CostDisplayMode, LocationAssemblyMode, PriceAdjustmentMode } from "@/lib/budgets/scope-pricing";
import {
    assertBudgetChildInActiveTenant,
    assertBudgetInActiveTenant,
} from "@/lib/budget-tenant";

export async function updateLocationAction(
    locationId: string,
    budgetId: string,
    patch: {
        name?: string;
        description?: string;
        show_costs_on_print?: boolean;
        costs_display_mode?: CostDisplayMode;
        price_adjustment_enabled?: boolean;
        price_adjustment_input_mode?: PriceAdjustmentMode;
        assembly_mode?: LocationAssemblyMode;
        assembly_value?: number;
    }
) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetChildInActiveTenant("budget_location", locationId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        await db.update(requireRecordId("budget_location", locationId)).merge({
            ...patch,
            updated_at: new Date().toISOString(),
        });
        if (patch.assembly_mode !== undefined || patch.assembly_value !== undefined) {
            await recalculateBudgetTotal(budgetId);
        }
        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error updating location:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao atualizar local" };
    }
}

export async function addLocationAction(budgetId: string, name: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetInActiveTenant(budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const raw = await db.create(new Table("budget_location")).content({
            budget_id: gate.budgetRecordId,
            name,
            order_index: Date.now(),
            show_costs_on_print: false,
            costs_display_mode: "section",
            price_adjustment_enabled: false,
            price_adjustment_input_mode: "fixed",
            assembly_mode: "percent",
            assembly_value: 0,
            created_at: new Date().toISOString(),
        });
        const created = Array.isArray(raw) ? raw[0] : raw;

        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true, data: toPlain(serializeBudgetEntity(created)) };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error adding location:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao adicionar local" };
    }
}

export async function updateSectionAction(
    sectionId: string,
    budgetId: string,
    patch: {
        name?: string;
        description?: string;
        show_costs_on_print?: boolean;
        costs_display_mode?: CostDisplayMode;
        price_adjustment_enabled?: boolean;
        price_adjustment_input_mode?: PriceAdjustmentMode;
        assembly_mode?: LocationAssemblyMode;
        assembly_value?: number;
    }
) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetChildInActiveTenant("budget_section", sectionId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        await db.update(requireRecordId("budget_section", sectionId)).merge({
            ...patch,
            updated_at: new Date().toISOString(),
        });
        if (patch.assembly_mode !== undefined || patch.assembly_value !== undefined) {
            await recalculateBudgetTotal(budgetId);
        }
        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error updating section:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao atualizar trecho" };
    }
}

export async function addSectionAction(locationId: string, budgetId: string, name: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const locGate = await assertBudgetChildInActiveTenant("budget_location", locationId, budgetId);
    if (!locGate.ok) return { success: false, error: locGate.error };

    const db = await getDb();
    try {
        const raw = await db.create(new Table("budget_section")).content({
            location_id: requireRecordId("budget_location", locationId),
            budget_id: locGate.budgetRecordId,
            name,
            order_index: Date.now(),
            show_costs_on_print: false,
            costs_display_mode: "section",
            price_adjustment_enabled: false,
            price_adjustment_input_mode: "fixed",
            created_at: new Date().toISOString(),
        });
        const created = Array.isArray(raw) ? raw[0] : raw;

        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true, data: toPlain(serializeBudgetEntity(created)) };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error adding section:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao adicionar trecho" };
    }
}

export async function deleteLocationAction(locationId: string, budgetId: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetChildInActiveTenant("budget_location", locationId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const locationRecordId = requireRecordId("budget_location", locationId);
        const now = new Date().toISOString();

        const sectionsRes = await db.query<[Array<{ id: string }>]>(
            "SELECT id FROM budget_section WHERE location_id = $locationId AND deleted_at IS NONE",
            { locationId: locationRecordId }
        );
        const sections = sectionsRes?.[0] || [];

        for (const sec of sections) {
            const sectionIdRaw = sec.id?.toString?.() ? sec.id.toString() : String(sec.id);
            const sectionRecordId = requireRecordId("budget_section", sectionIdRaw);
            await db.query(
                "UPDATE budget_item SET deleted_at = $now WHERE section_id = $sectionId AND deleted_at IS NONE",
                { sectionId: sectionRecordId, now }
            );
            await db.query(
                "UPDATE budget_image SET deleted_at = $now WHERE section_id = $sectionId AND deleted_at IS NONE",
                { sectionId: sectionRecordId, now }
            );
            await db.update(sectionRecordId).merge({ deleted_at: now });
        }

        await db.query(
            "UPDATE budget_image SET deleted_at = $now WHERE location_id = $locationId AND deleted_at IS NONE",
            { locationId: locationRecordId, now }
        );

        await db.update(locationRecordId).merge({ deleted_at: now });
        await recalculateBudgetTotal(budgetId);

        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error deleting location:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao remover local" };
    }
}

export async function deleteSectionAction(sectionId: string, budgetId: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetChildInActiveTenant("budget_section", sectionId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const sectionRecordId = requireRecordId("budget_section", sectionId);
        const now = new Date().toISOString();
        await db.query(
            "UPDATE budget_item SET deleted_at = $now WHERE section_id = $sectionId AND deleted_at IS NONE",
            { sectionId: sectionRecordId, now }
        );
        await db.query(
            "UPDATE budget_image SET deleted_at = $now WHERE section_id = $sectionId AND deleted_at IS NONE",
            { sectionId: sectionRecordId, now }
        );
        await db.update(sectionRecordId).merge({ deleted_at: now });
        await recalculateBudgetTotal(budgetId);

        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error deleting section:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao remover trecho" };
    }
}

export async function duplicateSectionAction(sectionId: string, budgetId: string, newName?: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetChildInActiveTenant("budget_section", sectionId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const secRecordId = requireRecordId("budget_section", sectionId);

        const originalRaw = await db.select(secRecordId);
        const original = (Array.isArray(originalRaw) ? originalRaw[0] : originalRaw) as
            | Record<string, unknown>
            | undefined;
        if (!original) return { success: false, error: "Trecho não encontrado" };

        const itemsRes = await db.query<[Array<Record<string, unknown>>]>(
            "SELECT * FROM budget_item WHERE section_id = $secId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC",
            { secId: secRecordId }
        );
        const items = itemsRes?.[0] || [];

        const newSection = await db.create(new Table("budget_section")).content({
            location_id: original.location_id,
            budget_id: requireRecordId("budget", budgetId),
            name: newName || `${original.name} - Cópia`,
            description: original.description,
            show_costs_on_print: Boolean(original.show_costs_on_print),
            costs_display_mode:
                original.costs_display_mode === "location" || original.costs_display_mode === "general"
                    ? original.costs_display_mode
                    : "section",
            price_adjustment_enabled: Boolean(original.price_adjustment_enabled),
            price_adjustment_input_mode:
                original.price_adjustment_input_mode === "percent" ? "percent" : "fixed",
            assembly_mode:
                original.assembly_mode === "fixed" || original.assembly_mode === "manual"
                    ? original.assembly_mode
                    : "percent",
            assembly_value: Number(original.assembly_value ?? 0),
            order_index: Date.now(),
            created_at: new Date().toISOString(),
        });
        const created = Array.isArray(newSection) ? newSection[0] : newSection;
        const newSectionId = String(created.id);

        for (const item of items) {
            await db.create(new Table("budget_item")).content({
                ...buildDuplicatedBudgetItemContent(item as Record<string, unknown>),
                section_id: new StringRecordId(newSectionId),
                budget_id: requireRecordId("budget", budgetId),
            });
        }

        await recalculateBudgetTotal(budgetId);
        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true, newSectionId };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error duplicating section:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao duplicar trecho" };
    }
}

export async function reorderLocationsAction(orderedLocationIds: string[], budgetId: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetInActiveTenant(budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const budgetRecordId = gate.budgetRecordId;
        const [rows] = await db.query<[Array<{ id: unknown }>]>(
            "SELECT id FROM budget_location WHERE budget_id = $bid AND deleted_at IS NONE",
            { bid: budgetRecordId }
        );
        const allowed = new Set(
            (rows ?? []).map((r) => canonicalTableRecordId("budget_location", r.id))
        );
        const normalized = orderedLocationIds.map((id) => canonicalTableRecordId("budget_location", id));
        if (new Set(normalized).size !== normalized.length) {
            return { success: false, error: "Lista de locais inválida" };
        }
        if (normalized.length !== allowed.size || !normalized.every((id) => allowed.has(id))) {
            return { success: false, error: "Lista de locais desatualizada" };
        }
        for (let i = 0; i < normalized.length; i++) {
            await db
                .update(requireRecordId("budget_location", normalized[i]))
                .merge({ order_index: i * 10 });
        }
        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error reordering locations:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao reordenar locais" };
    }
}

export async function reorderSectionsAction(orderedSectionIds: string[], budgetId: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetInActiveTenant(budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        for (let i = 0; i < orderedSectionIds.length; i++) {
            await db
                .update(requireRecordId("budget_section", orderedSectionIds[i]))
                .merge({ order_index: i * 10 });
        }
        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error reordering sections:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao reordenar trechos" };
    }
}

export async function moveSectionAction(sectionId: string, newLocationId: string, budgetId: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const sectionGate = await assertBudgetChildInActiveTenant("budget_section", sectionId, budgetId);
    if (!sectionGate.ok) return { success: false, error: sectionGate.error };
    const locGate = await assertBudgetChildInActiveTenant("budget_location", newLocationId, budgetId);
    if (!locGate.ok) return { success: false, error: locGate.error };

    const db = await getDb();
    try {
        await db.update(requireRecordId("budget_section", sectionId)).merge({
            location_id: requireRecordId("budget_location", newLocationId),
            updated_at: new Date().toISOString(),
        });
        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error moving section:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao mover trecho" };
    }
}

export async function duplicateLocationAction(locationId: string, budgetId: string, newName?: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetChildInActiveTenant("budget_location", locationId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const locRecordId = requireRecordId("budget_location", locationId);

        const originalRaw = await db.select(locRecordId);
        const original = (Array.isArray(originalRaw) ? originalRaw[0] : originalRaw) as
            | Record<string, unknown>
            | undefined;
        if (!original) return { success: false, error: "Local não encontrado" };

        const newLocation = await db.create(new Table("budget_location")).content({
            budget_id: gate.budgetRecordId,
            name: newName || `${original.name} - Cópia`,
            description: original.description,
            order_index: Date.now(),
            show_costs_on_print: Boolean(original.show_costs_on_print),
            costs_display_mode:
                original.costs_display_mode === "location" || original.costs_display_mode === "general"
                    ? original.costs_display_mode
                    : "section",
            price_adjustment_enabled: Boolean(original.price_adjustment_enabled),
            price_adjustment_input_mode:
                original.price_adjustment_input_mode === "percent" ? "percent" : "fixed",
            assembly_mode: original.assembly_mode ?? "percent",
            assembly_value: Number(original.assembly_value ?? 0),
            created_at: new Date().toISOString(),
        });
        const createdLoc = Array.isArray(newLocation) ? newLocation[0] : newLocation;
        const newLocationId = String(createdLoc.id);

        const sectionsRes = await db.query<[Array<Record<string, unknown>>]>(
            "SELECT * FROM budget_section WHERE location_id = $locId ORDER BY order_index ASC",
            { locId: locRecordId }
        );
        const sections = sectionsRes?.[0] || [];

        for (const sec of sections) {
            const origSecRecordId = requireRecordId("budget_section", String(sec.id));

            const newSection = await db.create(new Table("budget_section")).content({
                location_id: new StringRecordId(newLocationId),
                budget_id: requireRecordId("budget", budgetId),
                name: sec.name,
                description: sec.description,
                order_index: Date.now(),
                show_costs_on_print: Boolean(sec.show_costs_on_print),
                costs_display_mode:
                    sec.costs_display_mode === "location" || sec.costs_display_mode === "general"
                        ? sec.costs_display_mode
                        : "section",
                price_adjustment_enabled: Boolean(sec.price_adjustment_enabled),
                price_adjustment_input_mode:
                    sec.price_adjustment_input_mode === "percent" ? "percent" : "fixed",
                assembly_mode:
                    sec.assembly_mode === "fixed" || sec.assembly_mode === "manual"
                        ? sec.assembly_mode
                        : "percent",
                assembly_value: Number(sec.assembly_value ?? 0),
                created_at: new Date().toISOString(),
            });
            const createdSec = Array.isArray(newSection) ? newSection[0] : newSection;
            const newSectionId = String(createdSec.id);

            const itemsRes = await db.query<[Array<Record<string, unknown>>]>(
                "SELECT * FROM budget_item WHERE section_id = $secId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC",
                { secId: origSecRecordId }
            );
            const items = itemsRes?.[0] || [];
            for (const item of items) {
                await db.create(new Table("budget_item")).content({
                    ...buildDuplicatedBudgetItemContent(item as Record<string, unknown>),
                    section_id: new StringRecordId(newSectionId),
                    budget_id: requireRecordId("budget", budgetId),
                });
            }
        }

        await recalculateBudgetTotal(budgetId);
        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error duplicating location:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao duplicar local" };
    }
}

"use server";

import { revalidatePath } from "next/cache";
import { StringRecordId, Table } from "surrealdb";
import { assertActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { budgetRevalidatePath } from "@/lib/budgets/budget-path";
import { serializeBudgetEntity } from "@/actions/budget-shared";
import {
    InvalidRecordIdError,
    requireRecordId,
    canonicalTableRecordId,
} from "@/lib/surreal-record-ids";
import { buildDuplicatedBudgetItemContent, recalculateBudgetTotal } from "@/actions/budget-hierarchy-helpers";

export async function updateLocationAction(
    locationId: string,
    budgetId: string,
    patch: { name?: string; description?: string }
) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        await db.update(requireRecordId("budget_location", locationId)).merge({
            ...patch,
            updated_at: new Date().toISOString(),
        });
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
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const raw = await db.create(new Table("budget_location")).content({
            budget_id: requireRecordId("budget", budgetId),
            name,
            order_index: Date.now(),
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
    patch: { name?: string; description?: string }
) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        await db.update(requireRecordId("budget_section", sectionId)).merge({
            ...patch,
            updated_at: new Date().toISOString(),
        });
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
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const raw = await db.create(new Table("budget_section")).content({
            location_id: requireRecordId("budget_location", locationId),
            budget_id: requireRecordId("budget", budgetId),
            name,
            order_index: Date.now(),
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
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

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
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

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
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

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
            order_index: Date.now(),
            created_at: new Date().toISOString(),
        });
        const created = Array.isArray(newSection) ? newSection[0] : newSection;
        const newSectionId = String(created.id);

        for (const item of items) {
            await db.create(new Table("budget_item")).content({
                ...buildDuplicatedBudgetItemContent(item as Record<string, unknown>),
                section_id: new StringRecordId(newSectionId),
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
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const budgetRecordId = requireRecordId("budget", budgetId);
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
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

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
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

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
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const locRecordId = requireRecordId("budget_location", locationId);

        const originalRaw = await db.select(locRecordId);
        const original = (Array.isArray(originalRaw) ? originalRaw[0] : originalRaw) as
            | Record<string, unknown>
            | undefined;
        if (!original) return { success: false, error: "Local não encontrado" };

        const newLocation = await db.create(new Table("budget_location")).content({
            budget_id: requireRecordId("budget", budgetId),
            name: newName || `${original.name} - Cópia`,
            description: original.description,
            order_index: Date.now(),
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

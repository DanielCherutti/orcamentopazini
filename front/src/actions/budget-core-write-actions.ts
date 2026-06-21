"use server";

import { Table } from "surrealdb";
import { revalidatePath } from "next/cache";
import { StringRecordId } from "surrealdb";
import { assertWriteActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { budgetRevalidatePath } from "@/lib/budgets/budget-path";
import type { Budget } from "@/types/budget-types";
import { addBlockAction } from "@/actions/budget-compositor-block-actions";
import {
    COMPOSITOR_SCOPE_BLOCK_DEFAULT_LABEL,
    DEFAULT_COMPOSITOR_PANEL_LABEL,
} from "@/components/budgets/compositor/compositor-content-utils";
import { mergeCoverDocumentProps } from "@/lib/budgets/cover-document";
import {
    InvalidRecordIdError,
    requireRecordId,
    canonicalTableRecordId,
    recordIdToString,
} from "@/lib/surreal-record-ids";
import { isBudgetEditableStatus } from "@/lib/budgets/budget-status";
import { getNextBudgetNumberAction } from "@/actions/budget-core-read-actions";
import { recalculateBudgetTotal } from "@/actions/budget-hierarchy-helpers";
import { assertBudgetInActiveTenant, budgetBelongsToActiveTenant } from "@/lib/budget-tenant";
import { assertClientInActiveTenant } from "@/lib/tenant-access";
import { requireActiveTenantId, tenantRecordId } from "@/lib/tenant-query";

export async function createBudgetAction(title: string, code: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const tenantId = await requireActiveTenantId();
        const numberResult = await getNextBudgetNumberAction();
        if (!numberResult.success || !numberResult.data) {
            return { success: false, error: numberResult.error };
        }

        const budgetData = {
            title: title || numberResult.data.formattedCode,
            code: code || numberResult.data.nextNumber,
            status: "draft" as const,
            total_value: 0,
            client_id: "",
            tenant_id: tenantRecordId(tenantId),
            use_compositor: true,
            compositor_label: DEFAULT_COMPOSITOR_PANEL_LABEL,
            show_costs_on_print: false,
            costs_display_mode: "section",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const result = await db.create(new Table("budget")).content(budgetData);
        const createdRecord = Array.isArray(result) ? result[0] : result;
        const createdBudget = {
            ...createdRecord,
            id: String(createdRecord.id),
        } as Budget;

        await addBlockAction({
            budgetId: createdBudget.id!,
            parentId: null,
            type: "cover",
            label: "CAPA",
            props: mergeCoverDocumentProps({}) as Record<string, unknown>,
        });
        await addBlockAction({
            budgetId: createdBudget.id!,
            parentId: null,
            type: "header_footer",
            label: "CABEÇALHO E RODAPÉ",
            props: {},
        });
        await addBlockAction({
            budgetId: createdBudget.id!,
            parentId: null,
            type: "toc",
            label: "SUMÁRIO",
            props: {},
        });
        await addBlockAction({
            budgetId: createdBudget.id!,
            parentId: null,
            type: "figures",
            label: "LISTA DE FIGURAS",
            props: {},
        });
        await addBlockAction({ budgetId: createdBudget.id!, parentId: null, type: "scope", label: COMPOSITOR_SCOPE_BLOCK_DEFAULT_LABEL });

        revalidatePath("/budgets");

        return { success: true, data: toPlain(createdBudget) };
    } catch (error) {
        console.error("Error creating budget:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao criar orçamento" };
    }
}

export async function updateBudgetAction(budgetId: string, updates: Partial<Budget>) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const gate = await assertBudgetInActiveTenant(budgetId, db);
        if (!gate.ok) return { success: false, error: gate.error };

        const allowedFields = [
            "client_id",
            "title",
            "description",
            "status",
            "section_number",
            "compositor_label",
            "payment_terms",
            "delivery_time",
            "validity_days",
            "issue_date",
            "show_costs_on_print",
            "costs_display_mode",
            "quote_markup_percent",
            "quote_discount_percent",
            "quote_markup_equipment_percent",
            "quote_discount_equipment_percent",
            "quote_markup_assembly_percent",
            "quote_discount_assembly_percent",
            "quote_show_sections",
            "quote_note_above",
            "quote_note_below",
        ];

        const budgetRecordId = gate.budgetRecordId;

        const safeUpdates: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        };

        Object.keys(updates).forEach((key) => {
            if (allowedFields.includes(key) && updates[key as keyof Budget] !== undefined) {
                safeUpdates[key] = updates[key as keyof Budget];
            }
        });

        if (
            safeUpdates.client_id !== undefined &&
            safeUpdates.client_id !== null &&
            safeUpdates.client_id !== ""
        ) {
            const rawClientId = safeUpdates.client_id;
            if (
                typeof rawClientId === "object" &&
                rawClientId !== null &&
                "id" in (rawClientId as Record<string, unknown>)
            ) {
                safeUpdates.client_id = new StringRecordId(
                    String((rawClientId as Record<string, unknown>).id)
                );
            } else if (typeof rawClientId === "string" && rawClientId.trim().length > 0) {
                const clientGate = await assertClientInActiveTenant(rawClientId, db);
                if (!clientGate.ok) {
                    return { success: false, error: clientGate.error };
                }
                safeUpdates.client_id = requireRecordId("client", rawClientId);
            }
        }

        const structuralKeys = Object.keys(safeUpdates).filter((k) => k !== "updated_at" && k !== "status");

        if (structuralKeys.length > 0) {
            const currentRaw = await db.select(budgetRecordId);
            const currentBudget = (Array.isArray(currentRaw) ? currentRaw[0] : currentRaw) as Record<
                string,
                unknown
            >;
            const currentStatus = currentBudget?.status as string;
            if (!isBudgetEditableStatus(currentStatus)) {
                return {
                    success: false,
                    error: "Este compositor está finalizado ou fechado e não pode ser alterado.",
                };
            }
        }

        await db.update(budgetRecordId).merge(safeUpdates);

        revalidatePath(budgetRevalidatePath(budgetId));
        revalidatePath("/budgets");

        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error updating budget:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao atualizar orçamento" };
    }
}

export async function deleteBudgetAction(budgetId: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const gate = await assertBudgetInActiveTenant(budgetId, db);
        if (!gate.ok) return { success: false, error: gate.error };

        const budgetRecordId = gate.budgetRecordId;
        const currentRaw = await db.select(budgetRecordId);
        const currentBudget = (Array.isArray(currentRaw) ? currentRaw[0] : currentRaw) as
            | Record<string, unknown>
            | undefined
            | null;
        if (!currentBudget) {
            return { success: false, error: "Orçamento não encontrado." };
        }
        const currentStatus = String(currentBudget.status ?? "");
        if (!isBudgetEditableStatus(currentStatus)) {
            return {
                success: false,
                error: "Só é possível excluir orçamentos em andamento.",
            };
        }

        await db.delete(budgetRecordId);
        revalidatePath("/budgets");
        revalidatePath("/dashboard");
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error deleting budget:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao excluir orçamento" };
    }
}

export async function syncDraftPricesAction(
    budgetId: string
): Promise<{ success: boolean; updatedCount: number; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, updatedCount: 0, error: auth.error };

    const gate = await assertBudgetInActiveTenant(budgetId);
    if (!gate.ok) return { success: false, updatedCount: 0, error: gate.error };

    const runSync = async (): Promise<number> => {
        const db = await getDb();
        const budgetRecordId = gate.budgetRecordId;

        const itemQueries = [
            "SELECT * FROM budget_item WHERE block_id.budget_id = $budgetId AND deleted_at IS NONE FETCH product_id",
            "SELECT * FROM budget_item WHERE budget_id = $budgetId AND section_id IS NOT NONE AND deleted_at IS NONE FETCH product_id",
            "SELECT * FROM budget_item WHERE section_id.location_id.budget_id = $budgetId AND deleted_at IS NONE FETCH product_id",
            "SELECT * FROM budget_item WHERE section_id.budget_id = $budgetId AND deleted_at IS NONE FETCH product_id",
        ];
        const itemsById = new Map<string, Record<string, unknown>>();
        for (const query of itemQueries) {
            const itemsRes = await db.query<[Array<Record<string, unknown>>]>(query, {
                budgetId: budgetRecordId,
            });
            for (const item of itemsRes[0] || []) {
                itemsById.set(String(item.id), item);
            }
        }
        const items = Array.from(itemsById.values());

        let updatedCount = 0;
        for (const item of items) {
            const product = item.product_id as Record<string, unknown> | null;
            if (!product) continue;

            const currentUnitPrice = Number(product.equipmentPrice || 0);
            const currentLaborCost = Number(product.assemblyPrice || 0);
            const storedUnitPrice = Number(item.unit_price || 0);
            const storedLaborCost = Number(item.labor_cost || 0);

            if (currentUnitPrice !== storedUnitPrice || currentLaborCost !== storedLaborCost) {
                const quantity = Number(item.quantity || 1);
                const itemRecordId = requireRecordId("budget_item", String(item.id));
                await db.update(itemRecordId).merge({
                    unit_price: currentUnitPrice,
                    labor_cost: currentLaborCost,
                    total: (currentUnitPrice + currentLaborCost) * quantity,
                });
                updatedCount++;
            }
        }

        if (updatedCount > 0) {
            // Evita sobrescrever com soma parcial (somente block_id).
            // O total oficial precisa considerar escopo (section_id) + compositor (block_id).
            await recalculateBudgetTotal(budgetId);
        }

        return updatedCount;
    };

    try {
        const updatedCount = await runSync();
        return { success: true, updatedCount };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, updatedCount: 0, error: error.message };
        }
        if (isTokenExpiredError(error)) {
            resetDb();
            try {
                const updatedCount = await runSync();
                return { success: true, updatedCount };
            } catch (e2) {
                if (e2 instanceof InvalidRecordIdError) {
                    return { success: false, updatedCount: 0, error: e2.message };
                }
                console.error("syncDraftPricesAction retry error:", e2);
                if (isTokenExpiredError(e2)) resetDb();
                return {
                    success: false,
                    updatedCount: 0,
                    error: "Erro ao sincronizar preços (SurrealDB). Verifique se o servidor está no ar e se SURREALDB_PASS/SURREAL_PASS está correto.",
                };
            }
        }
        console.error("syncDraftPricesAction error:", error);
        return {
            success: false,
            updatedCount: 0,
            error: "Erro ao sincronizar preços (SurrealDB). Verifique conexão e credenciais.",
        };
    }
}

function nestedBudgetFromItem(item: Record<string, unknown>): Record<string, unknown> | null {
    const block = item.block_id;
    if (block && typeof block === "object" && !Array.isArray(block)) {
        const b = block as Record<string, unknown>;
        const budget = b.budget_id;
        if (budget && typeof budget === "object" && !Array.isArray(budget)) {
            return budget as Record<string, unknown>;
        }
    }
    const section = item.section_id;
    if (section && typeof section === "object" && !Array.isArray(section)) {
        const s = section as Record<string, unknown>;
        const budget = s.budget_id;
        if (budget && typeof budget === "object" && !Array.isArray(budget)) {
            return budget as Record<string, unknown>;
        }
        const location = s.location_id;
        if (location && typeof location === "object" && !Array.isArray(location)) {
            const loc = location as Record<string, unknown>;
            const locationBudget = loc.budget_id;
            if (
                locationBudget &&
                typeof locationBudget === "object" &&
                !Array.isArray(locationBudget)
            ) {
                return locationBudget as Record<string, unknown>;
            }
        }
    }
    return null;
}

function budgetIdStringFromRecord(budget: Record<string, unknown>): string | null {
    const id = budget.id;
    if (id == null) return null;
    return String(id);
}

function geometryProductMatches(
    geometryProductId: unknown,
    productRecordId: StringRecordId
): boolean {
    if (geometryProductId == null || geometryProductId === "") return false;
    try {
        return (
            canonicalTableRecordId("product", geometryProductId) ===
            canonicalTableRecordId("product", productRecordId)
        );
    } catch {
        return recordIdToString(geometryProductId) === recordIdToString(productRecordId);
    }
}

/** Evita cache do browser quando o arquivo no mesmo path é sobrescrito no storage. */
function stickerImageUrlWithCacheBust(url: string, token: number): string {
    const s = String(url).trim();
    if (!s) return s;
    const sep = s.includes("?") ? "&" : "?";
    return `${s}${sep}cb=${token}`;
}

function extractBudgetIdFromAnnotationRow(row: Record<string, unknown>): string | null {
    const imageIdRaw = row.image_id;
    if (!imageIdRaw || typeof imageIdRaw !== "object" || Array.isArray(imageIdRaw)) return null;
    const im = imageIdRaw as Record<string, unknown>;
    const bidVal = im.budget_id;
    if (bidVal == null) return null;
    if (typeof bidVal === "object" && bidVal !== null && "id" in bidVal) {
        return recordIdToString((bidVal as Record<string, unknown>).id);
    }
    return recordIdToString(bidVal);
}

/**
 * Figurinha em foto: só atualiza se o compositor da imagem estiver em draft.
 * Quando FETCH não expande `budget_id`, busca `budget_image` + `budget` explicitamente.
 */
async function isDraftBudgetForProductStickerRow(
    db: Awaited<ReturnType<typeof getDb>>,
    row: Record<string, unknown>
): Promise<boolean> {
    const imageIdRaw = row.image_id;
    let budgetIdRaw: unknown;

    if (imageIdRaw && typeof imageIdRaw === "object" && !Array.isArray(imageIdRaw)) {
        const im = imageIdRaw as Record<string, unknown>;
        budgetIdRaw = im.budget_id;
        if (
            budgetIdRaw &&
            typeof budgetIdRaw === "object" &&
            budgetIdRaw !== null &&
            "status" in budgetIdRaw
        ) {
            return isBudgetEditableStatus(
                String((budgetIdRaw as Record<string, unknown>).status ?? "")
            );
        }
    } else if (imageIdRaw != null) {
        try {
            const imgRid = requireRecordId("budget_image", recordIdToString(imageIdRaw));
            const [imgRows] = await db.query<[Array<{ budget_id?: unknown }>]>(
                "SELECT budget_id FROM budget_image WHERE id = $id LIMIT 1",
                { id: imgRid }
            );
            budgetIdRaw = imgRows?.[0]?.budget_id;
            if (
                budgetIdRaw &&
                typeof budgetIdRaw === "object" &&
                budgetIdRaw !== null &&
                "status" in budgetIdRaw
            ) {
                return isBudgetEditableStatus(
                    String((budgetIdRaw as Record<string, unknown>).status ?? "")
                );
            }
        } catch {
            return false;
        }
    } else {
        return false;
    }

    if (budgetIdRaw == null) return false;
    const bidStr =
        budgetIdRaw && typeof budgetIdRaw === "object" && budgetIdRaw !== null && "id" in budgetIdRaw
            ? recordIdToString((budgetIdRaw as Record<string, unknown>).id)
            : recordIdToString(budgetIdRaw);
    if (!bidStr) return false;
    try {
        const bid = requireRecordId("budget", bidStr);
        const [rows] = await db.query<[Array<{ status?: unknown }>]>(
            "SELECT status FROM budget WHERE id = $id LIMIT 1",
            { id: bid }
        );
        return isBudgetEditableStatus(String(rows?.[0]?.status ?? ""));
    } catch {
        return false;
    }
}

/** Dados do catálogo propagados para itens de compositor e figurinhas em fotos (só `draft`). */
export type ProductCatalogSyncSnapshot = {
    code: string;
    description: string;
    unit: string;
    equipmentPrice: number;
    assemblyPrice: number;
    imageUrl?: string | null;
};

/**
 * Após alterar o cadastro do produto, atualiza todas as linhas em orçamentos **em andamento** (`draft`):
 * descrição (nome exibido), unidade, preços de equipamento e mão de obra, total;
 * figurinhas vinculadas ao item (`linked_item_id`) e figurinhas só com `geometry.product_id`
 * (ex.: arrastadas do catálogo antes de existir `linked_item_id`).
 */
export async function syncProductCatalogToDraftBudgetItemsAction(
    productId: string,
    snapshot: ProductCatalogSyncSnapshot
): Promise<{ success: boolean; updatedItems: number; updatedStickers: number; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, updatedItems: 0, updatedStickers: 0, error: auth.error };

    const db = await getDb();
    try {
        const productRecordId = requireRecordId("product", productId);
        const productName =
            snapshot.description.trim() || snapshot.code.trim() || "Produto";
        const productUnit = snapshot.unit.trim();
        const unitPrice = snapshot.equipmentPrice;
        const laborCost = snapshot.assemblyPrice;

        const itemsRes = await db.query<[Array<Record<string, unknown>>]>(
            "SELECT * FROM budget_item WHERE product_id = $pid AND deleted_at IS NONE FETCH block_id, section_id, block_id.budget_id, section_id.budget_id, section_id.location_id, section_id.location_id.budget_id",
            { pid: productRecordId }
        );
        const items = itemsRes[0] || [];
        const budgetIdsToRecalc = new Set<string>();
        const itemRecordIdsForStickers: StringRecordId[] = [];
        let updatedItems = 0;

        for (const item of items) {
            const budget = nestedBudgetFromItem(item);
            if (!budget) continue;
            const bid = budgetIdStringFromRecord(budget);
            if (!bid || !(await budgetBelongsToActiveTenant(bid, db))) continue;
            const status = String(budget.status ?? "");
            if (!isBudgetEditableStatus(status)) continue;

            const qty = Math.max(1, Number(item.quantity || 1));
            const newTotal = (unitPrice + laborCost) * qty;

            const curName = String(item.product_name ?? "");
            const curCode = String(item.product_code ?? "");
            const curUnit = String(item.product_unit ?? "");
            const curU = Number(item.unit_price ?? 0);
            const curL = Number(item.labor_cost ?? 0);
            const curT = Number(item.total ?? 0);

            const productCode = snapshot.code.trim();
            const unchanged =
                curName === productName &&
                curCode === productCode &&
                curUnit === productUnit &&
                curU === unitPrice &&
                curL === laborCost &&
                curT === newTotal;

            const itemRecordId = requireRecordId("budget_item", String(item.id));

            if (!unchanged) {
                await db.update(itemRecordId).merge({
                    product_name: productName,
                    ...(productCode ? { product_code: productCode } : {}),
                    product_unit: productUnit,
                    unit_price: unitPrice,
                    labor_cost: laborCost,
                    total: newTotal,
                });
                updatedItems++;
                const bid = budgetIdStringFromRecord(budget);
                if (bid) budgetIdsToRecalc.add(bid);
            }

            itemRecordIdsForStickers.push(itemRecordId);
        }

        const stickerDone = new Set<string>();
        const budgetIdsFromStickerSync = new Set<string>();
        const stickerImageCacheBust = Date.now();
        let updatedStickers = 0;

        const mergeStickerRow = async (row: Record<string, unknown>) => {
            const annId = String(row.id);
            if (stickerDone.has(annId)) return;
            stickerDone.add(annId);

            const geo: Record<string, unknown> = {
                ...((row.geometry as Record<string, unknown>) ?? {}),
                product_name: productName,
            };
            if (snapshot.imageUrl !== undefined) {
                const u = snapshot.imageUrl;
                if (u != null && String(u).trim() !== "") {
                    geo.image_url = stickerImageUrlWithCacheBust(String(u), stickerImageCacheBust);
                } else {
                    geo.image_url = null;
                }
            }

            await db.update(requireRecordId("image_annotation", annId)).merge({ geometry: geo });
            updatedStickers++;
            const stickerBudgetId = extractBudgetIdFromAnnotationRow(row);
            if (stickerBudgetId) budgetIdsFromStickerSync.add(stickerBudgetId);
        };

        if (itemRecordIdsForStickers.length > 0) {
            const stickerRes = await db.query<[Array<Record<string, unknown>>]>(
                `SELECT * FROM image_annotation
                 WHERE tool_type = 'product_sticker'
                 AND linked_item_id IS NOT NONE
                 AND linked_item_id INSIDE $ids
                 FETCH image_id, image_id.budget_id`,
                { ids: itemRecordIdsForStickers }
            );
            for (const row of stickerRes[0] || []) {
                await mergeStickerRow(row);
            }
        }

        const orphanStickerRes = await db.query<[Array<Record<string, unknown>>]>(
            `SELECT * FROM image_annotation
             WHERE tool_type = 'product_sticker'
             FETCH image_id, image_id.budget_id`,
            {}
        );
        for (const row of orphanStickerRes[0] || []) {
            const g = row.geometry as Record<string, unknown> | undefined;
            if (!geometryProductMatches(g?.product_id, productRecordId)) continue;
            if (!(await isDraftBudgetForProductStickerRow(db, row))) continue;
            await mergeStickerRow(row);
        }

        for (const bid of budgetIdsFromStickerSync) {
            revalidatePath(budgetRevalidatePath(bid));
        }

        for (const bid of budgetIdsToRecalc) {
            await recalculateBudgetTotal(bid);
            revalidatePath(budgetRevalidatePath(bid));
        }

        if (updatedItems > 0 || updatedStickers > 0) {
            revalidatePath("/budgets");
        }

        return { success: true, updatedItems, updatedStickers };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, updatedItems: 0, updatedStickers: 0, error: error.message };
        }
        console.error("syncProductCatalogToDraftBudgetItemsAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return {
            success: false,
            updatedItems: 0,
            updatedStickers: 0,
            error: "Erro ao propagar cadastro do produto aos orçamentos",
        };
    }
}

/** @deprecated Use `syncProductCatalogToDraftBudgetItemsAction` com snapshot completo. */
export async function syncProductPricesToDraftBudgetsAction(
    productId: string,
    unitPrice: number,
    laborCost: number
): Promise<{ success: boolean; updatedItems: number; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, updatedItems: 0, error: auth.error };

    const db = await getDb();
    try {
        const productRecordId = requireRecordId("product", productId);
        const rawP = await db.select(productRecordId);
        const p = (Array.isArray(rawP) ? rawP[0] : rawP) as Record<string, unknown> | undefined;
        if (!p) {
            return { success: false, updatedItems: 0, error: "Produto não encontrado" };
        }
        const code = String(p.code ?? "");
        const description = String(p.description ?? "");
        const unit = String(p.unit ?? "");
        const res = await syncProductCatalogToDraftBudgetItemsAction(productId, {
            code,
            description,
            unit,
            equipmentPrice: unitPrice,
            assemblyPrice: laborCost,
            imageUrl: p.imageUrl != null ? String(p.imageUrl) : undefined,
        });
        return { success: res.success, updatedItems: res.updatedItems, error: res.error };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, updatedItems: 0, error: error.message };
        }
        console.error("syncProductPricesToDraftBudgetsAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, updatedItems: 0, error: "Erro ao propagar preços aos orçamentos" };
    }
}

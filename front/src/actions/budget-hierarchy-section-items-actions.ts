"use server";

import { revalidatePath } from "next/cache";
import { Table } from "surrealdb";
import { assertWriteActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { budgetRevalidatePath } from "@/lib/budgets/budget-path";
import type { BudgetItem, BudgetLocation } from "@/types/budget-types";
import { serializeBudgetEntity } from "@/actions/budget-shared";
import { getProductGroupProductsAction } from "@/actions/product-group-actions";
import {
    InvalidRecordIdError,
    canonicalTableRecordId,
    recordIdToString,
    requireRecordId,
    safeStringRecordId,
} from "@/lib/surreal-record-ids";
import { extractProductId, recalculateBudgetTotal } from "@/actions/budget-hierarchy-helpers";
import { budgetItemsFromGroupedBySectionId } from "@/lib/budgets/budget-section-items-grouped";
import { computeItemSubtotal, type PriceAdjustmentMode } from "@/lib/budgets/scope-pricing";
import {
    assertBudgetChildInActiveTenant,
    assertBudgetInActiveTenant,
    assertSectionsInActiveTenant,
} from "@/lib/budget-tenant";
import { auditTenantAction } from "@/lib/audit-log";
import {
    generateTemporaryProductCode,
    parseTemporaryProductInput,
    resolveAssemblyPrice,
    type TemporaryProductInput,
} from "@/lib/products/temporary-product";
import { requireActiveTenantId, tenantRecordId } from "@/lib/tenant-query";
import { assertEntityInActiveTenant } from "@/lib/tenant-access";
import { moveItemAfterGroupMembers } from "@/lib/budgets/item-group-segment";

/** Próximo `order_index` na seção (múltiplos de 10, alinhado a `reorderSectionItemsAction`). */
async function nextSectionItemOrderIndex(
    db: Awaited<ReturnType<typeof getDb>>,
    sectionId: string
): Promise<number> {
    const sectionRecordId = requireRecordId("budget_section", sectionId);
    try {
        const res = await db.query<[Array<{ m: number | null }>]>(
            `SELECT math::max(order_index) AS m FROM budget_item WHERE section_id = $sectionId AND deleted_at IS NONE GROUP ALL`,
            { sectionId: sectionRecordId }
        );
        const max = res[0]?.[0]?.m;
        const n = max == null || Number.isNaN(Number(max)) ? -10 : Number(max);
        return n + 10;
    } catch {
        return 0;
    }
}

/**
 * Sempre cria uma nova linha no escopo (mesmo produto repetido = linhas separadas).
 */
async function createBudgetItemInSection(
    db: Awaited<ReturnType<typeof getDb>>,
    sectionId: string,
    budgetId: string,
    productId: string,
    productName: string,
    unitPrice: number,
    laborCost: number,
    quantity: number,
    productUnit?: string,
    productCode?: string,
    productNcm?: string,
): Promise<string> {
    const unitLabel = productUnit?.trim();
    const codeLabel = productCode?.trim();
    const ncmLabel = productNcm?.trim();
    const orderIndex = await nextSectionItemOrderIndex(db, sectionId);
    const computedTotal = computeItemSubtotal({
        quantity,
        unit_price: unitPrice,
        labor_cost: laborCost,
        price_adjustment_mode: null,
        price_adjustment_value: 0,
        observation_extra_value: 0,
    });
    const raw = await db.create(new Table("budget_item")).content({
        section_id: requireRecordId("budget_section", sectionId),
        budget_id: requireRecordId("budget", budgetId),
        product_id: requireRecordId("product", productId),
        product_name: productName,
        ...(codeLabel ? { product_code: codeLabel } : {}),
        ...(ncmLabel ? { product_ncm: ncmLabel } : {}),
        ...(unitLabel ? { product_unit: unitLabel } : {}),
        quantity,
        unit_price: unitPrice,
        labor_cost: laborCost,
        total: computedTotal,
        observation_text: "",
        observation_show_on_print: false,
        labor_show_on_print: false,
        observation_extra_value: 0,
        price_adjustment_mode: null,
        price_adjustment_value: 0,
        assembly_manual_value: 0,
        order_index: orderIndex,
        created_at: new Date().toISOString(),
    });
    const created = Array.isArray(raw) ? raw[0] : raw;
    if (!created?.id) throw new Error("Falha ao obter id do item criado");
    return String(created.id);
}

/**
 * Serialização compartilhada para linhas de `budget_item` vindas do Surreal (uma seção ou orçamento inteiro).
 */
async function serializeBudgetItemsFromRawQueryRows(
    db: Awaited<ReturnType<typeof getDb>>,
    rawRows: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
    let items = rawRows.map((item) => {
        const serialized = serializeBudgetEntity(item);
        const productSource =
            serialized.product_data ??
            (typeof serialized.product_id === "object" ? serialized.product_id : null);
        if (productSource && typeof productSource === "object") {
            const pd = { ...(productSource as Record<string, unknown>) };
            if (pd.id) pd.id = String(pd.id);
            if (pd.company_id) pd.company_id = String(pd.company_id);
            if (pd.created_at) pd.created_at = String(pd.created_at);
            if (pd.updated_at) pd.updated_at = String(pd.updated_at);
            if (Array.isArray(pd.group_ids)) {
                pd.group_ids = (pd.group_ids as unknown[]).map((g) =>
                    typeof g === "object" && g !== null ? String(g) : g
                );
            }
            if (Array.isArray(pd.attachments)) {
                pd.attachments = (pd.attachments as unknown[]).map((a) =>
                    typeof a === "object" && a !== null
                        ? serializeBudgetEntity(a as Record<string, unknown>)
                        : a
                );
            }
            serialized.product_data = pd;
        }
        return serialized;
    });

    const needFetch = items.filter((it) => {
        const pd = (it as Record<string, unknown>).product_data as Record<string, unknown> | undefined;
        const productId = extractProductId((it as Record<string, unknown>).product_id);
        return productId != null && !pd?.description && !pd?.name && !pd?.code;
    });
    if (needFetch.length > 0) {
        const productIds = [
            ...new Set(
                needFetch
                    .map((it) => extractProductId((it as Record<string, unknown>).product_id))
                    .filter(Boolean)
            ),
        ] as string[];
        const productsMap = new Map<string, Record<string, unknown>>();
        for (const rawId of productIds) {
            const cleanId = rawId.replace(/^product:/, "");
            const pr = safeStringRecordId("product", cleanId);
            if (!pr) continue;
            try {
                const res = await db.select(pr);
                const p = Array.isArray(res) ? res[0] : res;
                if (p && typeof p === "object") {
                    const prod = p as Record<string, unknown>;
                    productsMap.set(rawId, prod);
                    productsMap.set(cleanId, prod);
                    productsMap.set(`product:${cleanId}`, prod);
                }
            } catch {
                // produto pode ter sido deletado
            }
        }
        items = items.map((it) => {
            const pd = (it as Record<string, unknown>).product_data as Record<string, unknown> | undefined;
            if (pd?.description || pd?.name || pd?.code) return it;
            const productId = extractProductId((it as Record<string, unknown>).product_id);
            if (!productId) return it;
            const product =
                productsMap.get(productId) ?? productsMap.get(productId.replace(/^product:/, ""));
            if (product) {
                (it as Record<string, unknown>).product_data = {
                    id: String(product.id),
                    code: product.code,
                    ncm: product.ncm,
                    description: product.description ?? product.name,
                    name: product.name,
                    unit: product.unit,
                    imageUrl: product.imageUrl ?? product.image_url ?? undefined,
                    is_temporary: Boolean(product.is_temporary),
                };
            }
            return it;
        });
    }

    items = items.map((it) => {
        const r = it as Record<string, unknown>;
        const pd = r.product_data as Record<string, unknown> | undefined;
        if (!r.product_name) {
            const resolved = String(pd?.description ?? pd?.name ?? pd?.code ?? "");
            if (resolved) r.product_name = resolved;
        }
        if (!r.product_code && pd?.code != null && String(pd.code).trim() !== "") {
            r.product_code = String(pd.code).trim();
        }
        if (!r.product_ncm && pd?.ncm != null && String(pd.ncm).trim() !== "") {
            r.product_ncm = String(pd.ncm).trim();
        }
        const u = pd?.unit;
        if (u != null && String(u).trim() !== "" && !r.product_unit) {
            r.product_unit = String(u);
        }
        return it;
    });

    return items;
}

/**
 * Chave canónica do trecho a partir do `section_id` cru da query (antes de serializeBudgetEntity).
 * Cobre RecordId/StringRecordId do driver (`String(x)` costuma ser `table:suffix`), `{ tb, id }` e `{ id }`.
 */
function budgetItemSectionGroupKey(raw: unknown): string {
    if (raw == null) return "";
    if (typeof raw === "string") {
        return canonicalTableRecordId("budget_section", raw);
    }
    if (typeof raw === "object") {
        const o = raw as Record<string, unknown>;
        if (typeof o.tb === "string" && o.id != null) {
            return canonicalTableRecordId("budget_section", raw);
        }
        if (o.id != null) {
            return canonicalTableRecordId("budget_section", o.id);
        }
        const s = String(raw);
        if (s.length > 0 && !s.startsWith("[object ")) {
            return canonicalTableRecordId("budget_section", s);
        }
        return "";
    }
    const s = String(raw);
    if (s.length > 0 && !s.startsWith("[object ")) {
        return canonicalTableRecordId("budget_section", s);
    }
    return "";
}

/** Itens para UI/PDF sem `FETCH product_id` nem lookups extra ao catálogo. */
function serializeBudgetItemsLight(rawRows: Array<Record<string, unknown>>): BudgetItem[] {
    return rawRows.map((row) => {
        const s = serializeBudgetEntity(row) as Record<string, unknown>;
        // `serializeBudgetEntity` pode transformar RecordId do Surreal em `{}` (props não enumeráveis).
        // Preservamos IDs relacionais diretamente da linha original da query.
        const sectionId = recordIdToString(row.section_id ?? s.section_id);
        if (sectionId) s.section_id = sectionId;

        const productId = recordIdToString(row.product_id ?? s.product_id);
        if (productId) {
            s.product_id = productId;
        } else {
            const pid = s.product_id;
            if (pid && typeof pid === "object" && pid !== null && "id" in (pid as object)) {
                s.product_id = String((pid as Record<string, unknown>).id ?? "");
            }
        }
        return toPlain(s) as BudgetItem;
    });
}

/**
 * Enriquecimento leve para UI (anotador/catálogo): injeta `product_data` e
 * relação `product_id` expandida com campos essenciais, incluindo `imageUrl`.
 */
async function hydrateLightItemsProductData(
    db: Awaited<ReturnType<typeof getDb>>,
    items: BudgetItem[]
): Promise<BudgetItem[]> {
    const ids = [
        ...new Set(
            items
                .map((it) => extractProductId((it as unknown as Record<string, unknown>).product_id))
                .filter(Boolean)
        ),
    ] as string[];
    if (ids.length === 0) return items;

    const byId = new Map<string, Record<string, unknown>>();
    await Promise.all(
        ids.map(async (rawId) => {
            const clean = rawId.replace(/^product:/, "");
            const rid = safeStringRecordId("product", clean);
            if (!rid) return;
            try {
                const selected = await db.select(rid);
                const p = (Array.isArray(selected) ? selected[0] : selected) as
                    | Record<string, unknown>
                    | undefined;
                if (!p) return;
                const normalized: Record<string, unknown> = {
                    id: String(p.id ?? `product:${clean}`),
                    code: p.code,
                    ncm: p.ncm,
                    description: p.description ?? p.name ?? "",
                    name: p.name,
                    unit: p.unit,
                    imageUrl: p.imageUrl ?? p.image_url ?? undefined,
                    is_temporary: Boolean(p.is_temporary),
                    equipmentPrice: Number(p.equipmentPrice ?? 0),
                    assemblyPrice: Number(p.assemblyPrice ?? 0),
                    assemblyPriceType:
                        p.assemblyPriceType === "percentage" ? "percentage" : "fixed",
                    assemblyPricePercentage:
                        p.assemblyPricePercentage == null
                            ? null
                            : Number(p.assemblyPricePercentage),
                    detailedDescription: p.detailedDescription ?? "",
                };
                byId.set(rawId, normalized);
                byId.set(clean, normalized);
                byId.set(`product:${clean}`, normalized);
            } catch {
                // ignore produto inexistente
            }
        })
    );

    return items.map((it) => {
        const row = it as unknown as Record<string, unknown>;
        const pid = extractProductId(row.product_id);
        const currentPd =
            row.product_data && typeof row.product_data === "object"
                ? (row.product_data as Record<string, unknown>)
                : null;
        const mergedPd = {
            ...(currentPd ?? {}),
            ...(pid ? byId.get(pid) ?? {} : {}),
        };
        if (Object.keys(mergedPd).length > 0) {
            row.product_data = mergedPd;
            // Compatibilidade com pontos da UI que leem `item.product_id` como objeto.
            row.product_id = mergedPd;
            if (!row.product_code && mergedPd.code != null && String(mergedPd.code).trim() !== "") {
                row.product_code = String(mergedPd.code).trim();
            }
            if (!row.product_ncm && mergedPd.ncm != null && String(mergedPd.ncm).trim() !== "") {
                row.product_ncm = String(mergedPd.ncm).trim();
            }
        } else if (pid && row.product_name) {
            row.product_id = {
                id: pid,
                description: row.product_name,
                unit: row.product_unit,
            };
        }
        return it;
    });
}

/** Preenche código e NCM nos itens do escopo (PDF e itens antigos sem snapshot gravado). */
export async function enrichBudgetLocationsProductCodes(
    db: Awaited<ReturnType<typeof getDb>>,
    locations: BudgetLocation[] | undefined
): Promise<void> {
    const items: BudgetItem[] = [];
    for (const loc of locations ?? []) {
        for (const sec of loc.sections ?? []) {
            for (const item of sec.items ?? []) {
                items.push(item);
            }
        }
    }
    if (!items.length) return;

    for (const item of items) {
        const row = item as unknown as Record<string, unknown>;
        const pid = recordIdToString(row.product_id);
        if (pid) row.product_id = pid;
    }

    const productKeys = new Set<string>();
    for (const item of items) {
        const row = item as unknown as Record<string, unknown>;
        const hasCode = row.product_code && String(row.product_code).trim() !== "";
        const hasNcm = row.product_ncm && String(row.product_ncm).trim() !== "";
        if (hasCode && hasNcm) continue;
        const pid = extractProductId(row.product_id);
        if (!pid) continue;
        const canon = canonicalTableRecordId("product", pid);
        if (canon) productKeys.add(canon);
    }

    if (productKeys.size > 0) {
        const recordIds = [...productKeys]
            .map((id) => safeStringRecordId("product", id.replace(/^product:/, "")))
            .filter(Boolean);
        if (recordIds.length > 0) {
            try {
                const res = await db.query<[Array<{ id: unknown; code?: unknown; ncm?: unknown }>]>(
                    `SELECT id, code, ncm FROM product WHERE id INSIDE $ids`,
                    { ids: recordIds }
                );
                const codeByProductId = new Map<string, string>();
                const ncmByProductId = new Map<string, string>();
                for (const p of res[0] ?? []) {
                    const id = recordIdToString(p.id);
                    const code = String(p.code ?? "").trim();
                    const ncm = String(p.ncm ?? "").trim();
                    if (!id) continue;
                    if (code) {
                        codeByProductId.set(id, code);
                        codeByProductId.set(canonicalTableRecordId("product", id), code);
                    }
                    if (ncm) {
                        ncmByProductId.set(id, ncm);
                        ncmByProductId.set(canonicalTableRecordId("product", id), ncm);
                    }
                }
                for (const item of items) {
                    const row = item as unknown as Record<string, unknown>;
                    const pid = extractProductId(row.product_id);
                    if (!pid) continue;
                    const code =
                        codeByProductId.get(pid) ??
                        codeByProductId.get(canonicalTableRecordId("product", pid));
                    if (code) row.product_code = code;
                    const ncm =
                        ncmByProductId.get(pid) ??
                        ncmByProductId.get(canonicalTableRecordId("product", pid));
                    if (ncm && !String(row.product_ncm ?? "").trim()) row.product_ncm = ncm;
                }
            } catch (error) {
                console.warn("enrichBudgetLocationsProductCodes batch lookup:", error);
            }
        }
    }

    await hydrateLightItemsProductData(db, items);
}

/**
 * Uma query para vários trechos — substitui N× `getItemsBySectionAction` no escopo.
 * Não faz `FETCH product_id` (usa `product_name` já gravado no item).
 */
export async function getBudgetItemsBySectionIdsLightAction(sectionIds: string[]): Promise<{
    success: boolean;
    data?: Record<string, BudgetItem[]>;
    error?: string;
}> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    if (sectionIds.length === 0) {
        return { success: true, data: {} };
    }

    const sectionsGate = await assertSectionsInActiveTenant(sectionIds);
    if (!sectionsGate.ok) return { success: false, error: sectionsGate.error };

    const db = await getDb();
    try {
        const recordIds = sectionIds.map((sid) => requireRecordId("budget_section", sid));
        /**
         * Em alguns ambientes Surreal, `section_id INSIDE [ids...]` não retorna linhas de forma consistente.
         * Fazemos consultas por trecho em paralelo (validado em produção) e consolidamos no cliente.
         */
        const rawRows = (
            await Promise.all(
                recordIds.map(async (sectionId) => {
                    const result = await db.query<[Array<Record<string, unknown>>]>(
                        `SELECT * FROM budget_item WHERE section_id = $sectionId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC`,
                        { sectionId }
                    );
                    return result?.[0] ?? [];
                })
            )
        ).flat();
        const hydrated = await hydrateLightItemsProductData(db, serializeBudgetItemsLight(rawRows));
        const buckets = new Map<string, BudgetItem[]>();
        for (const item of hydrated) {
            const row = item as unknown as Record<string, unknown>;
            const sid = budgetItemSectionGroupKey(row.section_id);
            if (!sid) continue;
            const list = buckets.get(sid) ?? [];
            list.push(item);
            buckets.set(sid, list);
        }
        const grouped: Record<string, BudgetItem[]> = {};
        for (const [sid, bucket] of buckets) {
            grouped[sid] = bucket.map((it) => {
                (it as BudgetItem).section_id = sid;
                return it;
            });
        }
        return { success: true, data: grouped };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("getBudgetItemsBySectionIdsLightAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao carregar itens" };
    }
}

/** Itens de um trecho sem `FETCH product_id` (caminho quente do Escopo). */
export async function getItemsBySectionLightAction(sectionId: string): Promise<{
    success: boolean;
    data?: BudgetItem[];
    error?: string;
}> {
    const grouped = await getBudgetItemsBySectionIdsLightAction([sectionId]);
    if (!grouped.success) {
        return { success: false, error: grouped.error };
    }
    return {
        success: true,
        data: budgetItemsFromGroupedBySectionId(grouped.data, sectionId, {
            trustSingleBucket: true,
        }),
    };
}

export async function getItemsBySectionAction(sectionId: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetChildInActiveTenant("budget_section", sectionId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const sectionRecordId = requireRecordId("budget_section", sectionId);
        const result = await db.query<[Array<Record<string, unknown>>]>(
            `SELECT * FROM budget_item WHERE section_id = $sectionId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC FETCH product_id`,
            { sectionId: sectionRecordId }
        );
        const items = await serializeBudgetItemsFromRawQueryRows(db, result?.[0] || []);
        return { success: true, data: toPlain(items) };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("getItemsBySectionAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao carregar itens" };
    }
}

/**
 * Carrega todos os itens do orçamento numa única query e agrupa por trecho.
 * Evita centenas de round-trips (`getItemsBySectionAction` por trecho) no índice do escopo.
 */
export async function getBudgetItemsGroupedByBudgetIdAction(budgetId: string): Promise<{
    success: boolean;
    data?: Record<string, BudgetItem[]>;
    error?: string;
}> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetInActiveTenant(budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const budgetRecordId = gate.budgetRecordId;
        /**
         * Em bases legadas/migradas parcialmente, há mistura de linhas com e sem `budget_id`
         * denormalizado. Precisamos unir os três caminhos para não perder itens no agrupamento.
         */
        const mergedById = new Map<string, Record<string, unknown>>();
        const mergeRows = (rows: Array<Record<string, unknown>>) => {
            for (const row of rows) {
                const rid = recordIdToString(row.id) || String(row.id ?? "");
                if (!rid) continue;
                if (!mergedById.has(rid)) mergedById.set(rid, row);
            }
        };

        mergeRows(
            (
                await db.query<[Array<Record<string, unknown>>]>(
                    `SELECT * FROM budget_item WHERE budget_id = $budgetId AND section_id IS NOT NONE AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC FETCH product_id`,
                    { budgetId: budgetRecordId }
                )
            )?.[0] ?? []
        );
        mergeRows(
            (
                await db.query<[Array<Record<string, unknown>>]>(
                    `SELECT * FROM budget_item WHERE section_id.location_id.budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC FETCH product_id`,
                    { budgetId: budgetRecordId }
                )
            )?.[0] ?? []
        );
        mergeRows(
            (
                await db.query<[Array<Record<string, unknown>>]>(
                    `SELECT * FROM budget_item WHERE section_id.budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC FETCH product_id`,
                    { budgetId: budgetRecordId }
                )
            )?.[0] ?? []
        );
        const rawRows = Array.from(mergedById.values());
        const rows = await serializeBudgetItemsFromRawQueryRows(db, rawRows);
        const plain = toPlain(rows) as BudgetItem[];
        const grouped: Record<string, BudgetItem[]> = {};
        for (const it of plain) {
            const r = it as unknown as Record<string, unknown>;
            const sid = budgetItemSectionGroupKey(r.section_id);
            if (!sid) continue;
            (it as BudgetItem).section_id = sid;
            if (!grouped[sid]) grouped[sid] = [];
            grouped[sid].push(it);
        }
        return { success: true, data: grouped };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("getBudgetItemsGroupedByBudgetIdAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao carregar itens do orçamento" };
    }
}

/**
 * Variante leve para o Escopo: agrupa por trecho sem FETCH de produto.
 * Reduz payload e round-trips ao abrir índices grandes.
 */
export async function getBudgetItemsGroupedByBudgetIdLightAction(budgetId: string): Promise<{
    success: boolean;
    data?: Record<string, BudgetItem[]>;
    error?: string;
}> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetInActiveTenant(budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const budgetRecordId = gate.budgetRecordId;
        const mergedById = new Map<string, Record<string, unknown>>();
        const mergeRows = (rows: Array<Record<string, unknown>>) => {
            for (const row of rows) {
                const rid = recordIdToString(row.id) || String(row.id ?? "");
                if (!rid) continue;
                if (!mergedById.has(rid)) mergedById.set(rid, row);
            }
        };

        mergeRows(
            (
                await db.query<[Array<Record<string, unknown>>]>(
                    `SELECT * FROM budget_item WHERE budget_id = $budgetId AND section_id IS NOT NONE AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC`,
                    { budgetId: budgetRecordId }
                )
            )?.[0] ?? []
        );
        mergeRows(
            (
                await db.query<[Array<Record<string, unknown>>]>(
                    `SELECT * FROM budget_item WHERE section_id.location_id.budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC`,
                    { budgetId: budgetRecordId }
                )
            )?.[0] ?? []
        );
        mergeRows(
            (
                await db.query<[Array<Record<string, unknown>>]>(
                    `SELECT * FROM budget_item WHERE section_id.budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC`,
                    { budgetId: budgetRecordId }
                )
            )?.[0] ?? []
        );
        const rawRows = Array.from(mergedById.values());

        const plain = serializeBudgetItemsLight(rawRows);
        const grouped: Record<string, BudgetItem[]> = {};
        for (const it of plain) {
            const r = it as unknown as Record<string, unknown>;
            const sid = budgetItemSectionGroupKey(r.section_id);
            if (!sid) continue;
            (it as BudgetItem).section_id = sid;
            if (!grouped[sid]) grouped[sid] = [];
            grouped[sid].push(it);
        }
        return { success: true, data: grouped };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("getBudgetItemsGroupedByBudgetIdLightAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao carregar itens do orçamento" };
    }
}

export async function addItemAction(sectionId: string, budgetId: string, productId: string, quantity: number) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };
    if (!Number.isFinite(quantity) || quantity <= 0) {
        return { success: false, error: "Quantidade deve ser maior que zero" };
    }

    const gate = await assertBudgetChildInActiveTenant("budget_section", sectionId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const productRecordId = requireRecordId("product", productId);
        const productResult = await db.select(productRecordId);
        const product = Array.isArray(productResult) ? productResult[0] : productResult;
        if (!product) throw new Error("Produto não encontrado");

        const unitPrice = Number(product.equipmentPrice || 0);
        const laborCost = Number(product.assemblyPrice || 0);
        const productName = String(product.description || product.code || "");
        const productCode = String(product.code ?? "").trim();
        const productUnit = String((product as Record<string, unknown>).unit ?? "").trim();
        const productNcm = String((product as Record<string, unknown>).ncm ?? "").trim();

        const newItemId = await createBudgetItemInSection(
            db,
            sectionId,
            budgetId,
            productId,
            productName,
            unitPrice,
            laborCost,
            quantity,
            productUnit || undefined,
            productCode || undefined,
            productNcm || undefined,
        );

        await recalculateBudgetTotal(budgetId);
        revalidatePath(budgetRevalidatePath(budgetId));
        await auditTenantAction({
            action: "budget_item.add",
            resourceType: "budget_section",
            resourceId: sectionId,
            summary: "Item adicionado ao trecho",
            metadata: { budgetId, productId, itemId: newItemId },
        });
        return { success: true, itemId: newItemId };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error adding item:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao adicionar item" };
    }
}

const DEFAULT_COMPANY_ID = 0;

async function ensureUniqueTemporaryProductCode(
    db: Awaited<ReturnType<typeof getDb>>,
    tenantId: string,
    preferred?: string,
): Promise<string> {
    const tenantRid = tenantRecordId(tenantId);
    let candidate = (preferred?.trim() || generateTemporaryProductCode()).toUpperCase();

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const existing = await db.query<[Array<{ id: unknown }>]>(
            `SELECT id FROM product WHERE code = $code AND company_id = $company_id AND tenant_id = $tenantId LIMIT 1`,
            { code: candidate, company_id: DEFAULT_COMPANY_ID, tenantId: tenantRid },
        );
        if (!existing[0]?.length) return candidate;
        candidate = generateTemporaryProductCode();
    }

    throw new Error("Não foi possível gerar código único para o produto temporário");
}

export async function addTemporaryProductToSectionAction(
    sectionId: string,
    budgetId: string,
    rawProduct: TemporaryProductInput,
    quantity: number,
) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const parsed = parseTemporaryProductInput(rawProduct);
    if (!parsed.ok) {
        return {
            success: false,
            error: parsed.error,
            fieldErrors: parsed.fieldErrors,
        };
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
        return { success: false, error: "Quantidade inválida" };
    }

    const gate = await assertBudgetChildInActiveTenant("budget_section", sectionId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const tenantId = await requireActiveTenantId();
        const productInput = parsed.data;
        const code = await ensureUniqueTemporaryProductCode(db, tenantId, productInput.code);
        const assemblyPrice = resolveAssemblyPrice(productInput);
        const budgetRecordId = requireRecordId("budget", budgetId);

        const created = await db.create(new Table("product")).content({
            code,
            description: productInput.description.trim(),
            detailedDescription: productInput.detailedDescription?.trim() || null,
            unit: productInput.unit.trim(),
            ncm: productInput.ncm,
            equipmentPrice: productInput.equipmentPrice,
            assemblyPrice,
            assemblyPriceType: productInput.assemblyPriceType ?? "fixed",
            assemblyPricePercentage:
                productInput.assemblyPriceType === "percentage"
                    ? productInput.assemblyPricePercentage ?? null
                    : null,
            imageUrl: productInput.imageUrl?.trim() || null,
            group_ids: [],
            attachments: [],
            company_id: DEFAULT_COMPANY_ID,
            tenant_id: tenantRecordId(tenantId),
            is_temporary: true,
            source_budget_id: budgetRecordId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });

        const product = Array.isArray(created) ? created[0] : created;
        if (!product?.id) throw new Error("Falha ao criar produto temporário");

        const productId = String(product.id);
        const productName = productInput.description.trim();
        const unitPrice = productInput.equipmentPrice;
        const laborCost = assemblyPrice;

        const newItemId = await createBudgetItemInSection(
            db,
            sectionId,
            budgetId,
            productId,
            productName,
            unitPrice,
            laborCost,
            quantity,
            productInput.unit.trim(),
            code,
            productInput.ncm,
        );

        await recalculateBudgetTotal(budgetId);
        revalidatePath(budgetRevalidatePath(budgetId));
        await auditTenantAction({
            action: "budget_item.add_temporary",
            resourceType: "budget_section",
            resourceId: sectionId,
            summary: "Produto temporário adicionado ao trecho",
            metadata: { budgetId, productId, itemId: newItemId, code },
        });
        return { success: true, itemId: newItemId, productId };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("addTemporaryProductToSectionAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao adicionar produto temporário" };
    }
}

export async function updateTemporaryProductInSectionAction(
    itemId: string,
    budgetId: string,
    rawProduct: TemporaryProductInput,
    quantity: number,
) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const parsed = parseTemporaryProductInput(rawProduct);
    if (!parsed.ok) {
        return {
            success: false,
            error: parsed.error,
            fieldErrors: parsed.fieldErrors,
        };
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
        return { success: false, error: "Quantidade inválida" };
    }

    const gate = await assertBudgetChildInActiveTenant("budget_item", itemId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const itemRecordId = requireRecordId("budget_item", itemId);
        const selectedItem = await db.select(itemRecordId);
        const item = (Array.isArray(selectedItem) ? selectedItem[0] : selectedItem) as
            | Record<string, unknown>
            | undefined;
        if (!item || !item.section_id) {
            return { success: false, error: "Produto temporário não encontrado no trecho" };
        }

        const productId = extractProductId(item.product_id);
        if (!productId) return { success: false, error: "Produto temporário inválido" };
        const productGate = await assertEntityInActiveTenant(
            "product",
            productId,
            "Produto temporário não encontrado",
        );
        if (!productGate.ok) return { success: false, error: productGate.error };

        const productRecordId = requireRecordId("product", productId);
        const selectedProduct = await db.select(productRecordId);
        const currentProduct = (Array.isArray(selectedProduct)
            ? selectedProduct[0]
            : selectedProduct) as Record<string, unknown> | undefined;
        if (!currentProduct || currentProduct.is_temporary !== true) {
            return { success: false, error: "Somente produtos temporários podem ser editados" };
        }

        const tenantId = await requireActiveTenantId();
        const productInput = parsed.data;
        const requestedCode = (productInput.code?.trim() || generateTemporaryProductCode()).toUpperCase();
        const currentCode = String(currentProduct.code ?? "").trim().toUpperCase();
        const code =
            requestedCode === currentCode
                ? currentCode
                : await ensureUniqueTemporaryProductCode(db, tenantId, requestedCode);
        const assemblyPrice = resolveAssemblyPrice(productInput);
        const now = new Date().toISOString();
        const productContent = {
            code,
            description: productInput.description.trim(),
            detailedDescription: productInput.detailedDescription?.trim() || null,
            unit: productInput.unit.trim(),
            ncm: productInput.ncm,
            equipmentPrice: productInput.equipmentPrice,
            assemblyPrice,
            assemblyPriceType: productInput.assemblyPriceType ?? "fixed",
            assemblyPricePercentage:
                productInput.assemblyPriceType === "percentage"
                    ? productInput.assemblyPricePercentage ?? null
                    : null,
            imageUrl: productInput.imageUrl?.trim() || null,
            group_ids: Array.isArray(currentProduct.group_ids) ? currentProduct.group_ids : [],
            attachments: Array.isArray(currentProduct.attachments)
                ? currentProduct.attachments
                : [],
            company_id: currentProduct.company_id ?? DEFAULT_COMPANY_ID,
            tenant_id: tenantRecordId(tenantId),
            is_temporary: true,
            source_budget_id: requireRecordId("budget", budgetId),
            updated_at: now,
        };

        const referenceRows = await db.query<[Array<{ id: unknown }>]>(
            `SELECT id FROM budget_item
             WHERE product_id = $productId AND deleted_at IS NONE LIMIT 2`,
            { productId: productRecordId },
        );
        const isShared = (referenceRows[0]?.length ?? 0) > 1;
        let effectiveProductId = productRecordId;
        if (isShared) {
            const created = await db.create(new Table("product")).content({
                ...productContent,
                created_at: now,
            });
            const clonedProduct = Array.isArray(created) ? created[0] : created;
            if (!clonedProduct?.id) throw new Error("Falha ao isolar produto temporário");
            effectiveProductId = requireRecordId("product", String(clonedProduct.id));
        } else {
            await db.update(productRecordId).merge(productContent);
        }

        const total = computeItemSubtotal({
            quantity,
            unit_price: productInput.equipmentPrice,
            labor_cost: assemblyPrice,
            price_adjustment_mode:
                item.price_adjustment_mode === "percent" || item.price_adjustment_mode === "fixed"
                    ? item.price_adjustment_mode
                    : null,
            price_adjustment_value: Number(item.price_adjustment_value ?? 0),
            observation_extra_value: Number(item.observation_extra_value ?? 0),
        });
        await db.update(itemRecordId).merge({
            product_id: effectiveProductId,
            product_name: productInput.description.trim(),
            product_code: code,
            product_ncm: productInput.ncm,
            product_unit: productInput.unit.trim(),
            quantity,
            unit_price: productInput.equipmentPrice,
            labor_cost: assemblyPrice,
            total,
        });

        await recalculateBudgetTotal(budgetId);
        revalidatePath(budgetRevalidatePath(budgetId));
        await auditTenantAction({
            action: "budget_item.update_temporary",
            resourceType: "budget_item",
            resourceId: itemId,
            summary: "Produto temporário do trecho atualizado",
            metadata: {
                budgetId,
                productId: String(effectiveProductId),
                isolatedCopy: isShared,
                code,
            },
        });
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("updateTemporaryProductInSectionAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao atualizar produto temporário" };
    }
}

export async function addGroupToSectionAction(
    sectionId: string,
    budgetId: string,
    groupId: string,
    groupName: string,
    productQuantities: Record<string, number>,
    selectedProductIds: string[]
) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error, addedCount: 0 };

    const groupRecordId = safeStringRecordId("product_group", groupId);
    if (!groupRecordId) {
        return { success: false, error: "Identificador inválido", addedCount: 0 };
    }

    const productsRes = await getProductGroupProductsAction(groupId);
    if (!productsRes.success || !productsRes.data?.length) {
        return { success: false, error: "Este grupo não possui produtos cadastrados.", addedCount: 0 };
    }

    const gate = await assertBudgetChildInActiveTenant("budget_section", sectionId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error, addedCount: 0 };

    const db = await getDb();
    try {
        const selectedSet = new Set(
            selectedProductIds.map((id) => canonicalTableRecordId("product", id)).filter(Boolean)
        );
        const normalizedQty: Record<string, number> = {};
        for (const [k, v] of Object.entries(productQuantities)) {
            const canon = canonicalTableRecordId("product", k);
            if (canon) normalizedQty[canon] = v;
        }

        let orderIndex = await nextSectionItemOrderIndex(db, sectionId);
        const groupInstanceId = crypto.randomUUID();

        let inserted = 0;
        for (const product of productsRes.data) {
            const productId = canonicalTableRecordId("product", product.id);
            if (!productId || !selectedSet.has(productId)) continue;

            const unitPrice = Number(product.equipmentPrice || 0);
            const laborCost = Number(product.assemblyPrice || 0);
            const requestedQuantity = Number(normalizedQty[productId] ?? 1);
            const quantity = Number.isFinite(requestedQuantity) && requestedQuantity > 0
                ? requestedQuantity
                : 1;
            const productName = String(product.description || product.code || "");
            const productCode = String(product.code ?? "").trim();
            const productUnit = String(product.unit ?? "").trim();
            const productNcm = String(product.ncm ?? "").trim();

            await db.create(new Table("budget_item")).content({
                section_id: requireRecordId("budget_section", sectionId),
                budget_id: requireRecordId("budget", budgetId),
                product_id: requireRecordId("product", productId),
                product_name: productName,
                ...(productCode ? { product_code: productCode } : {}),
                ...(productNcm ? { product_ncm: productNcm } : {}),
                ...(productUnit ? { product_unit: productUnit } : {}),
                quantity,
                unit_price: unitPrice,
                labor_cost: laborCost,
                total: computeItemSubtotal({
                    quantity,
                    unit_price: unitPrice,
                    labor_cost: laborCost,
                    price_adjustment_mode: null,
                    price_adjustment_value: 0,
                    observation_extra_value: 0,
                }),
                observation_text: "",
                observation_show_on_print: false,
                labor_show_on_print: false,
                observation_extra_value: 0,
                price_adjustment_mode: null,
                price_adjustment_value: 0,
                assembly_manual_value: 0,
                group_id: groupRecordId,
                group_name: groupName,
                group_instance_id: groupInstanceId,
                order_index: orderIndex,
                created_at: new Date().toISOString(),
            });
            orderIndex += 10;
            inserted += 1;
        }

        if (inserted === 0 && selectedProductIds.length > 0) {
            return {
                success: false,
                error:
                    "Não foi possível associar os produtos selecionados. Atualize a página e tente novamente.",
                addedCount: 0,
            };
        }

        await recalculateBudgetTotal(budgetId);
        revalidatePath(budgetRevalidatePath(budgetId));
        await auditTenantAction({
            action: "budget_item.add_group",
            resourceType: "budget_section",
            resourceId: sectionId,
            summary: `Grupo adicionado ao trecho (${inserted} item(ns))`,
            metadata: { budgetId, groupId, addedCount: inserted },
        });
        return { success: true, addedCount: inserted };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message, addedCount: 0 };
        }
        console.error("Error adding group to section:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao adicionar grupo", addedCount: 0 };
    }
}

/** Agrupa itens já existentes apenas neste orçamento, sem criar um grupo no catálogo. */
export async function createTemporaryGroupInSectionAction(
    sectionId: string,
    budgetId: string,
    rawGroupName: string,
    rawItemIds: string[],
): Promise<{ success: boolean; error?: string; groupedCount?: number }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const groupName = rawGroupName.trim().replace(/\s+/g, " ");
    if (groupName.length < 2 || groupName.length > 120) {
        return { success: false, error: "Informe um nome entre 2 e 120 caracteres." };
    }
    const itemIds = [...new Set(rawItemIds.map((id) => canonicalTableRecordId("budget_item", id)).filter(Boolean))];
    if (itemIds.length === 0) {
        return { success: false, error: "Selecione ao menos um produto para o grupo." };
    }

    const sectionGate = await assertBudgetChildInActiveTenant("budget_section", sectionId, budgetId);
    if (!sectionGate.ok) return { success: false, error: sectionGate.error };

    const db = await getDb();
    try {
        const sectionRecordId = requireRecordId("budget_section", sectionId);
        const budgetRecordId = requireRecordId("budget", budgetId);
        const itemRecordIds = itemIds.map((id) => requireRecordId("budget_item", id));
        const rows = await db.query<[Array<{ id: unknown; section_id?: unknown; budget_id?: unknown }>]>(
            `SELECT id, section_id, budget_id FROM budget_item
             WHERE section_id = $sectionId AND budget_id = $budgetId AND deleted_at IS NONE
             ORDER BY order_index ASC, created_at ASC`,
            { sectionId: sectionRecordId, budgetId: budgetRecordId },
        );
        const sectionItemIds = (rows[0] ?? []).map((row) => canonicalTableRecordId("budget_item", row.id));
        const selectedSet = new Set(itemIds);
        const validIds = sectionItemIds.filter((id) => selectedSet.has(id));

        if (validIds.length !== itemRecordIds.length) {
            return { success: false, error: "Um ou mais produtos não pertencem a este trecho." };
        }

        const groupInstanceId = crypto.randomUUID();
        const firstSelectedIndex = sectionItemIds.findIndex((id) => selectedSet.has(id));
        const orderedIds = [
            ...sectionItemIds.slice(0, firstSelectedIndex).filter((id) => !selectedSet.has(id)),
            ...validIds,
            ...sectionItemIds.slice(firstSelectedIndex).filter((id) => !selectedSet.has(id)),
        ];
        for (const [index, orderedId] of orderedIds.entries()) {
            const itemId = requireRecordId("budget_item", orderedId);
            if (selectedSet.has(orderedId)) {
                await db.query(
                    `UPDATE $item SET
                        group_id = NONE,
                        group_name = $groupName,
                        group_instance_id = $groupInstanceId,
                        order_index = $orderIndex`,
                    { item: itemId, groupName, groupInstanceId, orderIndex: index * 10 },
                );
            } else {
                await db.update(itemId).merge({ order_index: index * 10 });
            }
        }

        revalidatePath(budgetRevalidatePath(budgetId));
        await auditTenantAction({
            action: "budget_item.create_temporary_group",
            resourceType: "budget_section",
            resourceId: sectionId,
            summary: `Grupo temporário criado (${validIds.length} item(ns))`,
            metadata: { budgetId, groupName, groupedCount: validIds.length },
        });
        return { success: true, groupedCount: validIds.length };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("createTemporaryGroupInSectionAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao criar grupo temporário" };
    }
}

export async function deleteItemAction(itemId: string, budgetId: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetChildInActiveTenant("budget_item", itemId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const itemRecordId = requireRecordId("budget_item", itemId);
        await db.update(itemRecordId).merge({ deleted_at: new Date().toISOString() });
        await recalculateBudgetTotal(budgetId);
        revalidatePath(budgetRevalidatePath(budgetId));
        await auditTenantAction({
            action: "budget_item.delete",
            resourceType: "budget_item",
            resourceId: itemId,
            summary: "Item removido do trecho",
            metadata: { budgetId },
        });
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error deleting item:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao remover item" };
    }
}

/** Remove vários itens do orçamento (soft delete), com um único recálculo do total. */
export async function deleteBudgetItemsBulkAction(
    itemIds: string[],
    budgetId: string
): Promise<{ success: boolean; error?: string; deletedCount: number }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error, deletedCount: 0 };

    const unique = [...new Set(itemIds.map((id) => String(id).trim()).filter(Boolean))];
    if (unique.length === 0) return { success: true, deletedCount: 0 };

    const gate = await assertBudgetInActiveTenant(budgetId);
    if (!gate.ok) return { success: false, error: gate.error, deletedCount: 0 };

    const db = await getDb();
    try {
        const budgetRecordId = gate.budgetRecordId;
        let itemRecordIds;
        try {
            itemRecordIds = unique.map((id) => requireRecordId("budget_item", id));
        } catch {
            return { success: false, error: "Identificador de item inválido", deletedCount: 0 };
        }

        const result = await db.query<[Array<{ id: unknown }>]>(
            `SELECT id FROM budget_item WHERE id INSIDE $ids AND budget_id = $budgetId AND deleted_at IS NONE`,
            { ids: itemRecordIds, budgetId: budgetRecordId }
        );
        const rows = result?.[0] ?? [];
        if (rows.length === 0) {
            return { success: true, deletedCount: 0 };
        }

        const now = new Date().toISOString();
        for (const row of rows) {
            const ridStr = recordIdToString(row.id);
            if (!ridStr) continue;
            const itemRecordId = requireRecordId("budget_item", ridStr);
            await db.update(itemRecordId).merge({ deleted_at: now });
        }

        await recalculateBudgetTotal(budgetId);
        revalidatePath(budgetRevalidatePath(budgetId));
        await auditTenantAction({
            action: "budget_item.delete_bulk",
            resourceType: "budget",
            resourceId: budgetId,
            summary: `${rows.length} item(ns) removidos em lote`,
            metadata: { deletedCount: rows.length },
        });
        return { success: true, deletedCount: rows.length };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message, deletedCount: 0 };
        }
        console.error("deleteBudgetItemsBulkAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao remover itens", deletedCount: 0 };
    }
}

export async function updateItemQuantityAction(itemId: string, budgetId: string, quantity: number) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };
    if (!Number.isFinite(quantity) || quantity <= 0) {
        return { success: false, error: "Quantidade deve ser maior que zero" };
    }

    const gate = await assertBudgetChildInActiveTenant("budget_item", itemId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const itemRecordId = requireRecordId("budget_item", itemId);
        const itemResult = (await db.select(itemRecordId)) as unknown as BudgetItem[];
        const item = Array.isArray(itemResult) ? itemResult[0] : itemResult;
        if (!item) throw new Error("Item not found");

        const unitPrice = Number(item.unit_price) || 0;
        const laborCost = Number(item.labor_cost) || 0;
        const priceAdjustmentModeRaw = (item as Record<string, unknown>).price_adjustment_mode;
        const priceAdjustmentMode: PriceAdjustmentMode | null =
            priceAdjustmentModeRaw === "percent" || priceAdjustmentModeRaw === "fixed"
                ? priceAdjustmentModeRaw
                : null;
        const priceAdjustmentValue = Number(
            (item as Record<string, unknown>).price_adjustment_value ?? 0
        );
        const observationExtraValue = Number(
            (item as Record<string, unknown>).observation_extra_value ?? 0
        );
        const newTotal = computeItemSubtotal({
            quantity,
            unit_price: unitPrice,
            labor_cost: laborCost,
            price_adjustment_mode: priceAdjustmentMode,
            price_adjustment_value: priceAdjustmentValue,
            observation_extra_value: observationExtraValue,
        });

        await db.update(itemRecordId).merge({ quantity, total: newTotal });
        await recalculateBudgetTotal(budgetId);

        revalidatePath(budgetRevalidatePath(budgetId));
        await auditTenantAction({
            action: "budget_item.update_quantity",
            resourceType: "budget_item",
            resourceId: itemId,
            summary: "Quantidade do item atualizada",
            metadata: { budgetId, quantity },
        });
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error updating item:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao atualizar item" };
    }
}

export async function updateItemLaborCostAction(itemId: string, budgetId: string, laborCost: number) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetChildInActiveTenant("budget_item", itemId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const itemRecordId = requireRecordId("budget_item", itemId);
        const itemResult = (await db.select(itemRecordId)) as unknown as BudgetItem[];
        const item = Array.isArray(itemResult) ? itemResult[0] : itemResult;
        if (!item) throw new Error("Item not found");

        const unitPrice = Number(item.unit_price) || 0;
        const quantity = Number(item.quantity) || 1;
        const priceAdjustmentModeRaw = (item as Record<string, unknown>).price_adjustment_mode;
        const priceAdjustmentMode: PriceAdjustmentMode | null =
            priceAdjustmentModeRaw === "percent" || priceAdjustmentModeRaw === "fixed"
                ? priceAdjustmentModeRaw
                : null;
        const priceAdjustmentValue = Number(
            (item as Record<string, unknown>).price_adjustment_value ?? 0
        );
        const observationExtraValue = Number(
            (item as Record<string, unknown>).observation_extra_value ?? 0
        );
        const newTotal = computeItemSubtotal({
            quantity,
            unit_price: unitPrice,
            labor_cost: laborCost,
            price_adjustment_mode: priceAdjustmentMode,
            price_adjustment_value: priceAdjustmentValue,
            observation_extra_value: observationExtraValue,
        });

        await db.update(itemRecordId).merge({ labor_cost: laborCost, total: newTotal });
        await recalculateBudgetTotal(budgetId);

        revalidatePath(budgetRevalidatePath(budgetId));
        await auditTenantAction({
            action: "budget_item.update_labor_cost",
            resourceType: "budget_item",
            resourceId: itemId,
            summary: "Custo de mão de obra do item atualizado",
            metadata: { budgetId, laborCost },
        });
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error updating labor cost:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao atualizar mão de obra" };
    }
}

export type SectionItemGroupTarget = {
    groupId: string | null;
    groupName: string;
    groupInstanceId?: string | null;
};

/** Atualiza a associação e reposiciona o item junto ao grupo de destino. `null` = sem grupo. */
export async function updateItemGroupInSectionAction(
    itemId: string,
    budgetId: string,
    target: SectionItemGroupTarget | null,
) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetChildInActiveTenant("budget_item", itemId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const itemRecordId = requireRecordId("budget_item", itemId);
        if (target?.groupId) {
            const groupGate = await assertEntityInActiveTenant(
                "product_group",
                target.groupId,
                "Grupo não encontrado",
            );
            if (!groupGate.ok) return { success: false, error: groupGate.error };
        }

        const itemRows = await db.query<[Array<Record<string, unknown>>]>(
            `SELECT id, section_id, group_id, group_name, group_instance_id
             FROM budget_item WHERE id = $item AND deleted_at IS NONE LIMIT 1`,
            { item: itemRecordId },
        );
        const currentItem = itemRows[0]?.[0];
        const sectionId = recordIdToString(currentItem?.section_id);
        if (!currentItem || !sectionId) {
            return { success: false, error: "Produto ou trecho não encontrado." };
        }

        const sectionRecordId = requireRecordId("budget_section", sectionId);
        const sectionRows = await db.query<[Array<Record<string, unknown>>]>(
            `SELECT id, group_id, group_name, group_instance_id
             FROM budget_item
             WHERE section_id = $sectionId AND deleted_at IS NONE
             ORDER BY order_index ASC, created_at ASC`,
            { sectionId: sectionRecordId },
        );
        const rows = sectionRows[0] ?? [];
        const rowId = (row: Record<string, unknown>) =>
            canonicalTableRecordId("budget_item", row.id);
        const groupIdOf = (row: Record<string, unknown>) =>
            row.group_id ? canonicalTableRecordId("product_group", row.group_id) : null;
        const instanceOf = (row: Record<string, unknown>) =>
            String(row.group_instance_id ?? "").trim() || null;
        const groupNameOf = (row: Record<string, unknown>) =>
            String(row.group_name ?? "").trim();

        const currentGroupId = groupIdOf(currentItem);
        const currentInstanceId = instanceOf(currentItem);
        const currentGroupName = groupNameOf(currentItem);
        const currentGroupMembers = rows
            .filter((row) => {
                if (rowId(row) === canonicalTableRecordId("budget_item", itemId)) return false;
                if (currentInstanceId) {
                    return (
                        instanceOf(row) === currentInstanceId &&
                        groupIdOf(row) === currentGroupId &&
                        groupNameOf(row) === currentGroupName
                    );
                }
                return currentGroupId != null && groupIdOf(row) === currentGroupId && !instanceOf(row);
            })
            .map(rowId);

        let targetInstanceId = target?.groupInstanceId?.trim() || null;
        let targetMembers: string[] = [];
        if (target) {
            const targetGroupId = target.groupId
                ? canonicalTableRecordId("product_group", target.groupId)
                : null;
            const targetGroupName = target.groupName.trim();
            if (!targetGroupName || (!targetGroupId && !targetInstanceId)) {
                return { success: false, error: "Grupo de destino inválido." };
            }
            targetMembers = rows
                .filter((row) => {
                    if (rowId(row) === canonicalTableRecordId("budget_item", itemId)) return false;
                    if (targetInstanceId) {
                        return (
                            instanceOf(row) === targetInstanceId &&
                            groupIdOf(row) === targetGroupId &&
                            groupNameOf(row) === targetGroupName
                        );
                    }
                    return targetGroupId != null && groupIdOf(row) === targetGroupId && !instanceOf(row);
                })
                .map(rowId);
            if (!targetInstanceId && targetMembers.length === 0) {
                targetInstanceId = crypto.randomUUID();
            }
            if (!targetGroupId && targetMembers.length === 0) {
                return { success: false, error: "Grupo temporário não encontrado neste trecho." };
            }
        }

        if (target === null) {
            await db.query(
                "UPDATE $item SET group_id = NONE, group_name = NONE, group_instance_id = NONE",
                { item: itemRecordId }
            );
        } else if (target.groupId) {
            await db.update(itemRecordId).merge({
                group_id: requireRecordId("product_group", target.groupId),
                group_name: target.groupName.trim(),
                group_instance_id: targetInstanceId,
            });
        } else {
            await db.query(
                `UPDATE $item SET
                    group_id = NONE,
                    group_name = $groupName,
                    group_instance_id = $groupInstanceId`,
                {
                    item: itemRecordId,
                    groupName: target.groupName.trim(),
                    groupInstanceId: targetInstanceId,
                },
            );
        }

        const orderedIds = rows.map(rowId).filter(Boolean);
        const reorderedIds = moveItemAfterGroupMembers(
            orderedIds,
            canonicalTableRecordId("budget_item", itemId),
            target ? targetMembers : currentGroupMembers,
        );
        for (const [index, orderedId] of reorderedIds.entries()) {
            await db.update(requireRecordId("budget_item", orderedId)).merge({
                order_index: index * 10,
            });
        }
        revalidatePath(budgetRevalidatePath(budgetId));
        await auditTenantAction({
            action: "budget_item.update_group",
            resourceType: "budget_item",
            resourceId: itemId,
            summary: "Grupo do item atualizado no trecho",
            metadata: {
                budgetId,
                groupId: target?.groupId ?? null,
                groupInstanceId: targetInstanceId,
            },
        });
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("updateItemGroupInSectionAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao atualizar grupo do item" };
    }
}

export async function reorderSectionItemsAction(orderedItemIds: string[], budgetId: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetInActiveTenant(budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        for (let i = 0; i < orderedItemIds.length; i++) {
            await db.update(requireRecordId("budget_item", orderedItemIds[i])).merge({
                order_index: i * 10,
            });
        }
        revalidatePath(budgetRevalidatePath(budgetId));
        await auditTenantAction({
            action: "budget_item.reorder",
            resourceType: "budget",
            resourceId: budgetId,
            summary: "Itens reordenados no trecho",
            metadata: { count: orderedItemIds.length },
        });
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error reordering items:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao reordenar itens" };
    }
}

export async function updateItemCommercialSettingsAction(
    itemId: string,
    budgetId: string,
    patch: {
        observation_text?: string;
        observation_show_on_print?: boolean;
        observation_extra_value?: number;
        price_adjustment_mode?: PriceAdjustmentMode | null;
        price_adjustment_value?: number;
        assembly_manual_value?: number;
        labor_show_on_print?: boolean;
    }
) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetChildInActiveTenant("budget_item", itemId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const itemRecordId = requireRecordId("budget_item", itemId);
        const itemResult = (await db.select(itemRecordId)) as unknown as BudgetItem[];
        const item = Array.isArray(itemResult) ? itemResult[0] : itemResult;
        if (!item) throw new Error("Item not found");

        const quantity = Number(item.quantity) || 1;
        const unitPrice = Number(item.unit_price) || 0;
        const laborCost = Number(item.labor_cost) || 0;

        const nextModeRaw =
            patch.price_adjustment_mode !== undefined
                ? patch.price_adjustment_mode
                : ((item as Record<string, unknown>).price_adjustment_mode as PriceAdjustmentMode | null);
        const nextMode: PriceAdjustmentMode | null =
            nextModeRaw === "percent" || nextModeRaw === "fixed" ? nextModeRaw : null;
        const nextAdjustmentValue =
            patch.price_adjustment_value !== undefined
                ? Number(patch.price_adjustment_value)
                : Number((item as Record<string, unknown>).price_adjustment_value ?? 0);
        const nextObservationExtra =
            patch.observation_extra_value !== undefined
                ? Number(patch.observation_extra_value)
                : Number((item as Record<string, unknown>).observation_extra_value ?? 0);

        const nextTotal = computeItemSubtotal({
            quantity,
            unit_price: unitPrice,
            labor_cost: laborCost,
            price_adjustment_mode: nextMode,
            price_adjustment_value: nextAdjustmentValue,
            observation_extra_value: nextObservationExtra,
        });

        const mergePayload: Record<string, unknown> = {
            total: nextTotal,
            updated_at: new Date().toISOString(),
        };
        if (patch.observation_text !== undefined) mergePayload.observation_text = patch.observation_text;
        if (patch.observation_show_on_print !== undefined) {
            mergePayload.observation_show_on_print = patch.observation_show_on_print;
        }
        if (patch.observation_extra_value !== undefined) {
            mergePayload.observation_extra_value = Number(patch.observation_extra_value);
        }
        if (patch.price_adjustment_mode !== undefined) {
            mergePayload.price_adjustment_mode = patch.price_adjustment_mode ?? null;
        }
        if (patch.price_adjustment_value !== undefined) {
            mergePayload.price_adjustment_value = Number(patch.price_adjustment_value);
        }
        if (patch.assembly_manual_value !== undefined) {
            mergePayload.assembly_manual_value = Number(patch.assembly_manual_value);
        }
        if (patch.labor_show_on_print !== undefined) {
            mergePayload.labor_show_on_print = Boolean(patch.labor_show_on_print);
        }

        await db.update(itemRecordId).merge(mergePayload);
        await recalculateBudgetTotal(budgetId);
        revalidatePath(budgetRevalidatePath(budgetId));
        await auditTenantAction({
            action: "budget_item.update_commercial",
            resourceType: "budget_item",
            resourceId: itemId,
            summary: "Configurações comerciais do item atualizadas",
            metadata: { budgetId },
        });
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("updateItemCommercialSettingsAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao atualizar observação/ajuste do item" };
    }
}

/**
 * Zera `price_adjustment_mode` e `price_adjustment_value` em todos os itens do trecho ou
 * de todos os trechos do local, recalculando `total` de cada linha (observação extra mantida).
 */
export async function clearScopeItemPriceAdjustmentsAction(
    budgetId: string,
    scope: { type: "section"; sectionId: string } | { type: "location"; locationId: string }
): Promise<{ success: boolean; error?: string; clearedCount?: number }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetInActiveTenant(budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        requireRecordId("budget", budgetId);

        let rawRows: Array<Record<string, unknown>> = [];
        if (scope.type === "section") {
            const sectionRecordId = requireRecordId("budget_section", scope.sectionId);
            const result = await db.query<[Array<Record<string, unknown>>]>(
                `SELECT * FROM budget_item WHERE section_id = $sectionId AND deleted_at IS NONE`,
                { sectionId: sectionRecordId }
            );
            rawRows = result?.[0] ?? [];
        } else {
            const locRecordId = requireRecordId("budget_location", scope.locationId);
            const secRes = await db.query<[Array<{ id: unknown }>]>(
                `SELECT id FROM budget_section WHERE location_id = $locId AND deleted_at IS NONE`,
                { locId: locRecordId }
            );
            const secStrings = (secRes[0] ?? []).map((r) => recordIdToString(r.id)).filter(Boolean);
            if (secStrings.length > 0) {
                const secIds = secStrings.map((s) => requireRecordId("budget_section", s));
                const itemRes = await db.query<[Array<Record<string, unknown>>]>(
                    `SELECT * FROM budget_item WHERE section_id INSIDE $secIds AND deleted_at IS NONE`,
                    { secIds }
                );
                rawRows = itemRes?.[0] ?? [];
            }
        }

        const now = new Date().toISOString();
        let clearedCount = 0;

        for (const row of rawRows) {
            const itemId = recordIdToString(row.id);
            if (!itemId) continue;

            const modeRaw = row.price_adjustment_mode;
            const hadMode = modeRaw === "percent" || modeRaw === "fixed";
            const val = Number(row.price_adjustment_value ?? 0);
            if (!hadMode && val === 0) continue;

            const quantity = Number(row.quantity) || 1;
            const unitPrice = Number(row.unit_price) || 0;
            const laborCost = Number(row.labor_cost) || 0;
            const observationExtraValue = Number(row.observation_extra_value ?? 0);

            const newTotal = computeItemSubtotal({
                quantity,
                unit_price: unitPrice,
                labor_cost: laborCost,
                price_adjustment_mode: null,
                price_adjustment_value: 0,
                observation_extra_value: observationExtraValue,
            });

            await db.update(requireRecordId("budget_item", itemId)).merge({
                price_adjustment_mode: null,
                price_adjustment_value: 0,
                total: newTotal,
                updated_at: now,
            });
            clearedCount += 1;
        }

        await recalculateBudgetTotal(budgetId);
        revalidatePath(budgetRevalidatePath(budgetId));
        if (clearedCount > 0) {
            await auditTenantAction({
                action: "budget_item.clear_price_adjustments",
                resourceType: "budget",
                resourceId: budgetId,
                summary: `Ajustes de preço limpos em ${clearedCount} item(ns)`,
                metadata: { clearedCount, scopeType: scope.type },
            });
        }
        return { success: true, clearedCount };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("clearScopeItemPriceAdjustmentsAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao zerar ajustes de preço dos itens" };
    }
}

/**
 * IDs de `product_group` referenciados por itens do compositor (escopo via seção/local
 * e compositor via bloco). Usado para restringir o painel de grupos no anotador de fotos.
 */
export async function getBudgetUsedProductGroupIdsAction(
    budgetId: string
): Promise<{ success: boolean; data?: string[]; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetInActiveTenant(budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const budgetRecordId = gate.budgetRecordId;
        const set = new Set<string>();

        const mergeGroupRows = (rows: Array<{ group_id: unknown }> | undefined) => {
            for (const row of rows ?? []) {
                const gid = canonicalTableRecordId("product_group", row.group_id);
                if (gid) set.add(gid);
            }
        };

        // Escopo: Surreal costuma não casar bem `IN (SELECT …)` com record ids — usamos INSIDE como no compositor.
        const locRes = await db.query<[Array<{ id: unknown }>]>(
            `SELECT id FROM budget_location WHERE budget_id = $bid AND deleted_at IS NONE`,
            { bid: budgetRecordId }
        );
        const locStrings = (locRes[0] ?? []).map((r) => recordIdToString(r.id)).filter(Boolean);
        if (locStrings.length > 0) {
            const locIds = locStrings.map((s) => requireRecordId("budget_location", s));
            const secRes = await db.query<[Array<{ id: unknown }>]>(
                `SELECT id FROM budget_section WHERE location_id INSIDE $locIds AND deleted_at IS NONE`,
                { locIds }
            );
            const secStrings = (secRes[0] ?? []).map((r) => recordIdToString(r.id)).filter(Boolean);
            if (secStrings.length > 0) {
                const secIds = secStrings.map((s) => requireRecordId("budget_section", s));
                const itemRes = await db.query<[Array<{ group_id: unknown }>]>(
                    `SELECT group_id FROM budget_item WHERE section_id INSIDE $secIds AND deleted_at IS NONE AND group_id IS NOT NONE`,
                    { secIds }
                );
                mergeGroupRows(itemRes[0]);
            }
        }

        const blockRes = await db.query<[Array<{ id: unknown }>]>(
            `SELECT id FROM budget_block WHERE budget_id = $bid AND deleted_at IS NONE`,
            { bid: budgetRecordId }
        );
        const blockStrings = (blockRes[0] ?? []).map((r) => recordIdToString(r.id)).filter(Boolean);
        if (blockStrings.length > 0) {
            const blockIds = blockStrings.map((s) => requireRecordId("budget_block", s));
            const itemRes = await db.query<[Array<{ group_id: unknown }>]>(
                `SELECT group_id FROM budget_item WHERE block_id INSIDE $blockIds AND deleted_at IS NONE AND group_id IS NOT NONE`,
                { blockIds }
            );
            mergeGroupRows(itemRes[0]);
        }

        return { success: true, data: [...set] };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("getBudgetUsedProductGroupIdsAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao carregar grupos do orçamento" };
    }
}

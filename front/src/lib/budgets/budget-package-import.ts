import path from "node:path";
import { Table, StringRecordId } from "surrealdb";
import { getDb } from "@/lib/surreal";
import { saveUploadBufferPreservingPath } from "@/lib/upload";
import { getNextBudgetNumberAction } from "@/actions/budget-core-read-actions";
import {
    recalculateBudgetTotalValue,
    createBudgetDuplicationMaps,
} from "@/actions/budget-core-duplicate-internals";
import { buildDuplicatedBudgetItemContent, extractProductId } from "@/actions/budget-hierarchy-helpers";
import { BUDGET_PACKAGE_MANIFEST } from "@/lib/budgets/budget-package-constants";
import {
    exportId,
    lookupExportIdInMap,
    normalizeRelationExportId,
    resolveRelationExportId,
} from "@/lib/budgets/budget-package-serialize";
import {
    normalizeBudgetPackageManifest,
    type BudgetPackageManifestV1,
} from "@/lib/budgets/budget-package-types";
import { normalizeAllUploadUrlsInValue, zipHasAssetFiles } from "@/lib/budgets/budget-package-urls";
import { decodeZipUtf8Entry, parseZipBuffer } from "@/lib/budgets/budget-package-zip";
import { requireActiveTenantId, tenantRecordId } from "@/lib/tenant-query";

export type ImportBudgetPackageResult =
    | { ok: true; budgetId: string; title: string }
    | { ok: false; error: string; status: number };

function sanitizeFilename(name: string): string {
    const base = path.basename(name);
    return base.replace(/[^\w.\-]+/g, "_") || "import.pazini.zip";
}

function normalizeZipEntryKey(name: string): string {
    return name.replace(/\\/g, "/").replace(/^\/+/, "");
}

function indexZipEntries(entries: Array<{ name: string; data: Buffer }>): Map<string, Buffer> {
    const map = new Map<string, Buffer>();
    for (const e of entries) {
        const key = normalizeZipEntryKey(e.name);
        if (!key) continue;
        map.set(key, e.data);
    }
    return map;
}

function findManifestBuffer(zipFiles: Map<string, Buffer>): Buffer | undefined {
    const direct = zipFiles.get(BUDGET_PACKAGE_MANIFEST);
    if (direct) return direct;

    const lowerManifest = BUDGET_PACKAGE_MANIFEST.toLowerCase();
    for (const [key, buf] of zipFiles) {
        const normalized = key.toLowerCase();
        if (normalized === lowerManifest || normalized.endsWith(`/${lowerManifest}`)) {
            return buf;
        }
    }
    return undefined;
}

function isZipPackageFilename(name: string): boolean {
    return name.endsWith(".zip") || name.endsWith(".pazini.zip") || name.includes(".pazini.");
}

type RestoreUploadFilesResult = {
    restored: number;
    missingInZip: number;
};

/** Restaura arquivos do ZIP em `uploads/` mantendo o mesmo caminho (UUIDs das URLs). */
async function restoreUploadFilesFromZip(
    zipFiles: Map<string, Buffer>,
): Promise<RestoreUploadFilesResult> {
    let restored = 0;
    let missingInZip = 0;

    const keys = [...zipFiles.keys()].map((k) => normalizeZipEntryKey(k));
    const byRel = new Map<string, Buffer>();
    for (const key of keys) {
        if (!key.startsWith("files/")) continue;
        const rel = key.slice("files/".length);
        if (!rel || rel.includes("..")) continue;
        byRel.set(rel, zipFiles.get(key)!);
    }

    for (const [rel, buf] of byRel) {
        try {
            await saveUploadBufferPreservingPath(buf, rel);
            restored++;
        } catch (err) {
            console.warn(`[budget-import] falha ao gravar upload ${rel}:`, err);
            missingInZip++;
        }
    }

    return { restored, missingInZip };
}

async function resolveOrCreateClient(
    db: Awaited<ReturnType<typeof getDb>>,
    client: Record<string, unknown> | null,
): Promise<StringRecordId | null> {
    if (!client) return null;

    const cnpj = client.cnpj != null ? String(client.cnpj).trim() : "";
    if (cnpj) {
        const existing = await db.query<[Array<{ id: unknown }>]>(
            "SELECT id FROM client WHERE cnpj = $cnpj LIMIT 1",
            { cnpj },
        );
        const row = existing[0]?.[0];
        if (row?.id) return new StringRecordId(String(row.id));
    }

    const name = String(client.name ?? "Cliente importado").trim() || "Cliente importado";
    const created = await db.create(new Table("client")).content({
        name,
        cnpj: cnpj || null,
        stateRegistration: client.stateRegistration ?? null,
        contact: client.contact ?? null,
        phone: client.phone ?? null,
        email: client.email ?? null,
        city: client.city ?? null,
        address: client.address ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    });
    const row = Array.isArray(created) ? created[0] : created;
    return new StringRecordId(String(row.id));
}

async function createProductFromPayload(
    db: Awaited<ReturnType<typeof getDb>>,
    raw: Record<string, unknown>,
    oldKey: string,
    map: Map<string, StringRecordId>,
) {
    const code = raw.code != null ? String(raw.code).trim() : "";
    if (code) {
        const existing = await db.query<[Array<{ id: unknown }>]>(
            "SELECT id FROM product WHERE code = $code LIMIT 1",
            { code },
        );
        const row = existing[0]?.[0];
        if (row?.id) {
            const id = new StringRecordId(String(row.id));
            map.set(oldKey, id);
            return;
        }
    }

    const payload = normalizeAllUploadUrlsInValue({ ...raw }) as Record<string, unknown>;
    delete payload._exportId;
    delete payload.id;
    payload.created_at = new Date().toISOString();
    payload.updated_at = new Date().toISOString();

    const created = await db.create(new Table("product")).content(payload);
    const row = Array.isArray(created) ? created[0] : created;
    map.set(oldKey, new StringRecordId(String(row.id)));
}

async function resolveProductIdMap(
    db: Awaited<ReturnType<typeof getDb>>,
    manifest: BudgetPackageManifestV1,
): Promise<Map<string, StringRecordId>> {
    const map = new Map<string, StringRecordId>();

    for (const raw of manifest.products) {
        await createProductFromPayload(db, raw, exportId(raw), map);
    }

    for (const item of manifest.items) {
        const prodKey =
            normalizeRelationExportId(item.product_id) ??
            extractProductId(item.product_id);
        if (!prodKey || map.has(prodKey)) continue;

        const embedded: Record<string, unknown> = {
            code: item.product_code ?? item.code,
            ncm: item.product_ncm ?? item.ncm,
            description: item.product_name ?? item.description ?? "Produto importado",
            unit: item.product_unit ?? item.unit,
            imageUrl: item.product_image_url ?? item.imageUrl,
            unit_price: item.unit_price,
        };
        await createProductFromPayload(db, embedded, prodKey, map);
    }

    return map;
}

/** Importa estrutura flat do manifest (após remapear URLs). */
async function importManifestStructure(
    db: Awaited<ReturnType<typeof getDb>>,
    manifest: BudgetPackageManifestV1,
    newBudgetRecordId: StringRecordId,
    productMap: Map<string, StringRecordId>,
) {
    const maps = createBudgetDuplicationMaps();
    const blockIdMap = maps.block;
    const locationIdMap = maps.location;
    const sectionIdMap = maps.section;
    const itemIdMap = maps.item;

    const blocks = [...manifest.blocks].sort(
        (a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0),
    );
    const pending = [...blocks];
    let guard = pending.length + 2;
    while (pending.length > 0 && guard-- > 0) {
        const batch: typeof pending = [];
        const rest: typeof pending = [];
        for (const block of pending) {
            const parentKey = resolveRelationExportId(block.parent_id);
            if (!parentKey || blockIdMap.has(parentKey)) batch.push(block);
            else rest.push(block);
        }
        for (const block of batch) {
            const parentId = lookupExportIdInMap(blockIdMap, block.parent_id);
            const props =
                block.props && typeof block.props === "object" ? { ...(block.props as object) } : {};
            const created = await db.create(new Table("budget_block")).content({
                budget_id: newBudgetRecordId,
                ...(parentId ? { parent_id: parentId } : {}),
                type: block.type,
                label: block.label,
                order_index: block.order_index,
                props,
            });
            const row = Array.isArray(created) ? created[0] : created;
            blockIdMap.set(exportId(block), new StringRecordId(String(row.id)));
        }
        pending.splice(0, pending.length, ...rest);
    }

    for (const loc of manifest.locations) {
        const created = await db.create(new Table("budget_location")).content({
            budget_id: newBudgetRecordId,
            name: loc.name,
            description: loc.description,
            order_index: loc.order_index,
            show_costs_on_print: Boolean(loc.show_costs_on_print),
            costs_display_mode: loc.costs_display_mode,
            price_adjustment_enabled: Boolean(loc.price_adjustment_enabled),
            price_adjustment_input_mode: loc.price_adjustment_input_mode,
            assembly_mode: loc.assembly_mode,
            assembly_value: Number(loc.assembly_value ?? 0),
            created_at: new Date().toISOString(),
        });
        const row = Array.isArray(created) ? created[0] : created;
        locationIdMap.set(exportId(loc), new StringRecordId(String(row.id)));
    }

    for (const sec of manifest.sections) {
        const locId = lookupExportIdInMap(locationIdMap, sec.location_id);
        if (!locId) {
            console.warn(
                "[budget-import] trecho ignorado (local não encontrado):",
                sec.name,
                normalizeRelationExportId(sec.location_id),
            );
            continue;
        }
        const created = await db.create(new Table("budget_section")).content({
            location_id: locId,
            budget_id: newBudgetRecordId,
            name: sec.name,
            description: sec.description,
            order_index: sec.order_index,
            show_costs_on_print: Boolean(sec.show_costs_on_print),
            costs_display_mode: sec.costs_display_mode,
            price_adjustment_enabled: Boolean(sec.price_adjustment_enabled),
            price_adjustment_input_mode: sec.price_adjustment_input_mode,
            assembly_mode: sec.assembly_mode,
            assembly_value: Number(sec.assembly_value ?? 0),
            created_at: new Date().toISOString(),
        });
        const row = Array.isArray(created) ? created[0] : created;
        sectionIdMap.set(exportId(sec), new StringRecordId(String(row.id)));
    }

    for (const item of manifest.items) {
        const content = buildDuplicatedBudgetItemContent(item as Record<string, unknown>);
        content.budget_id = newBudgetRecordId;

        const secId = lookupExportIdInMap(sectionIdMap, item.section_id);
        const blockId = lookupExportIdInMap(blockIdMap, item.block_id);
        if (secId) content.section_id = secId;
        if (blockId) content.block_id = blockId;

        const prodKey =
            normalizeRelationExportId(item.product_id) ?? extractProductId(item.product_id);
        if (prodKey) {
            const mapped = lookupExportIdInMap(productMap, prodKey) ?? productMap.get(prodKey);
            if (mapped) content.product_id = mapped;
        }

        const created = await db.create(new Table("budget_item")).content(content);
        const row = Array.isArray(created) ? created[0] : created;
        itemIdMap.set(exportId(item), new StringRecordId(String(row.id)));
    }

    const imageIdMap = new Map<string, StringRecordId>();

    for (const img of manifest.images) {
        const locId = lookupExportIdInMap(locationIdMap, img.location_id);
        const secId = lookupExportIdInMap(sectionIdMap, img.section_id);
        const blockId = lookupExportIdInMap(blockIdMap, img.block_id);

        const content: Record<string, unknown> = {
            budget_id: newBudgetRecordId,
            url: normalizeAllUploadUrlsInValue(img.url),
            width: img.width,
            height: img.height,
            order_index: img.order_index ?? Date.now(),
            created_at: new Date().toISOString(),
        };
        if (img.composed_url) {
            content.composed_url = normalizeAllUploadUrlsInValue(img.composed_url);
        }
        if (img.caption) content.caption = img.caption;
        if (img.editor_viewport != null) content.editor_viewport = img.editor_viewport;
        if (img.figure_frame_orientation) content.figure_frame_orientation = img.figure_frame_orientation;

        if (blockId) {
            content.block_id = blockId;
        } else if (secId) {
            content.section_id = secId;
        } else if (locId) {
            content.location_id = locId;
        } else {
            console.warn("[budget-import] imagem ignorada (sem local/trecho/bloco):", img.url);
            continue;
        }

        const created = await db.create(new Table("budget_image")).content(content);
        const row = Array.isArray(created) ? created[0] : created;
        imageIdMap.set(exportId(img), new StringRecordId(String(row.id)));
    }

    for (const ann of manifest.annotations) {
        const newImageId = lookupExportIdInMap(imageIdMap, ann.image_id);
        if (!newImageId) continue;

        const record: Record<string, unknown> = {
            image_id: newImageId,
            tool_type: ann.tool_type,
            style: ann.style ?? {},
            geometry: ann.geometry ?? {},
            content: ann.content,
            created_at: new Date(),
        };

        const linkedKey = resolveRelationExportId(ann.linked_item_id);
        if (linkedKey && itemIdMap.has(linkedKey)) {
            record.linked_item_id = itemIdMap.get(linkedKey);
        }

        if (ann.fontColor != null) record.fontColor = ann.fontColor;
        if (ann.strokeColor != null) record.strokeColor = ann.strokeColor;
        if (ann.textStrokeWidth != null) record.textStrokeWidth = ann.textStrokeWidth;
        if (ann.borderColor != null) record.borderColor = ann.borderColor;
        if (ann.lineStyle != null) record.lineStyle = ann.lineStyle;
        if (ann.lineStrokeWidth != null) record.lineStrokeWidth = ann.lineStrokeWidth;

        await db.create(new Table("image_annotation")).content(record);
    }
}

export async function importBudgetPackage(
    fileBuffer: Buffer,
    originalName: string,
    options?: { title?: string },
): Promise<ImportBudgetPackageResult> {
    let manifestRaw: unknown;
    const zipFiles = new Map<string, Buffer>();

    const name = sanitizeFilename(originalName).toLowerCase();
    if (isZipPackageFilename(name)) {
        try {
            const entries = parseZipBuffer(fileBuffer);
            const indexed = indexZipEntries(entries);
            for (const [key, data] of indexed) {
                zipFiles.set(key, data);
            }
            const manifestBuf = findManifestBuffer(zipFiles);
            if (!manifestBuf) {
                const sample = [...zipFiles.keys()].slice(0, 8).join(", ");
                return {
                    ok: false,
                    error: `Pacote inválido: manifest.json ausente${sample ? ` (entradas: ${sample}…)` : ""}`,
                    status: 400,
                };
            }
            manifestRaw = JSON.parse(decodeZipUtf8Entry(manifestBuf));
        } catch (err) {
            const detail = err instanceof Error ? err.message : "erro desconhecido";
            console.error("[budget-import] parse zip:", err);
            return {
                ok: false,
                error: `Arquivo ZIP inválido ou corrompido: ${detail}`,
                status: 400,
            };
        }
    } else if (name.endsWith(".json")) {
        try {
            manifestRaw = JSON.parse(fileBuffer.toString("utf8"));
        } catch {
            return { ok: false, error: "JSON inválido", status: 400 };
        }
    } else {
        return {
            ok: false,
            error: "Use um arquivo .pazini.zip ou manifest .json",
            status: 400,
        };
    }

    const manifestNormalized = normalizeBudgetPackageManifest(manifestRaw);
    if (!manifestNormalized) {
        return { ok: false, error: "Formato de pacote não reconhecido (versão incompatível)", status: 400 };
    }

    let manifest = manifestNormalized;
    const hasZipAssets = zipHasAssetFiles(zipFiles);
    const exportMode = manifest.exportMode ?? (hasZipAssets ? "full" : "data");

    if (hasZipAssets) {
        const { restored, missingInZip } = await restoreUploadFilesFromZip(zipFiles);
        console.info(
            `[budget-import] arquivos restaurados: ${restored} (modo ${exportMode})` +
                (missingInZip ? `, falhas: ${missingInZip}` : ""),
        );
    } else if (exportMode !== "data") {
        console.warn(
            "[budget-import] pacote marcado como",
            exportMode,
            "mas sem pasta files/ no ZIP — imagens continuarão apontando para URLs antigas",
        );
    }

    manifest = normalizeAllUploadUrlsInValue(manifest) as BudgetPackageManifestV1;

    const db = await getDb();
    let clientRecordId = await resolveOrCreateClient(db, manifest.client);
    if (!clientRecordId) {
        clientRecordId = await resolveOrCreateClient(db, { name: "Cliente importado" });
    }
    if (!clientRecordId) {
        return { ok: false, error: "Não foi possível criar cliente para o orçamento importado", status: 500 };
    }

    const productMap = await resolveProductIdMap(db, manifest);

    const numberResult = await getNextBudgetNumberAction();
    const nextCode = numberResult.data?.nextNumber ?? String(Date.now());
    const importTitle =
        options?.title?.trim() ||
        `${String(manifest.budget.title ?? "Orçamento importado")} (importado)`;

    const b = manifest.budget;
    const useCompositor = Boolean(b.use_compositor);
    const tenantId = await requireActiveTenantId();

    const newBudgetRaw = await db.create(new Table("budget")).content({
        title: importTitle,
        code: nextCode,
        status: "draft",
        total_value: 0,
        client_id: clientRecordId,
        tenant_id: tenantRecordId(tenantId),
        use_compositor: useCompositor,
        description: b.description,
        payment_terms: b.payment_terms,
        delivery_time: b.delivery_time,
        validity_days: b.validity_days,
        section_number: b.section_number,
        show_costs_on_print: b.show_costs_on_print ?? false,
        costs_display_mode: b.costs_display_mode ?? "section",
        compositor_label: b.compositor_label,
        quote_notes: b.quote_notes,
        quote_discount: b.quote_discount,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    });
    const newBudget = Array.isArray(newBudgetRaw) ? newBudgetRaw[0] : newBudgetRaw;
    const newBudgetId = String(newBudget.id);
    const newBudgetRecordId = new StringRecordId(newBudgetId);

    await importManifestStructure(db, manifest, newBudgetRecordId, productMap);
    await recalculateBudgetTotalValue(db, newBudgetRecordId, useCompositor);

    return { ok: true, budgetId: newBudgetId, title: importTitle };
}

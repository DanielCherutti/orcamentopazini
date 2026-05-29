import path from "node:path";
import { Table, StringRecordId } from "surrealdb";
import { getDb } from "@/lib/surreal";
import { saveUploadBuffer } from "@/lib/upload";
import { getNextBudgetNumberAction } from "@/actions/budget-core-read-actions";
import {
    recalculateBudgetTotalValue,
    createBudgetDuplicationMaps,
} from "@/actions/budget-core-duplicate-internals";
import { buildDuplicatedBudgetItemContent, extractProductId } from "@/actions/budget-hierarchy-helpers";
import {
    BUDGET_PACKAGE_MANIFEST,
    BUDGET_PACKAGE_MAX_IMPORT_BYTES,
} from "@/lib/budgets/budget-package-constants";
import { exportId, resolveRelationExportId } from "@/lib/budgets/budget-package-serialize";
import {
    isBudgetPackageManifestV1,
    type BudgetPackageManifestV1,
} from "@/lib/budgets/budget-package-types";
import {
    collectUploadPaths,
    replaceUploadUrls,
    toApiUploadUrl,
    uploadPathFromUrl,
    zipPathForUpload,
} from "@/lib/budgets/budget-package-urls";
import { parseZipBuffer } from "@/lib/budgets/budget-package-zip";

export type ImportBudgetPackageResult =
    | { ok: true; budgetId: string; title: string }
    | { ok: false; error: string; status: number };

function sanitizeFilename(name: string): string {
    const base = path.basename(name);
    return base.replace(/[^\w.\-]+/g, "_") || "import.pazini.zip";
}

async function buildUrlRemapFromZip(
    manifest: BudgetPackageManifestV1,
    zipFiles: Map<string, Buffer>,
): Promise<Map<string, string>> {
    const uploadPaths = new Set<string>();
    collectUploadPaths(manifest, uploadPaths);

    const pathToNewUrl = new Map<string, string>();

    for (const relPath of uploadPaths) {
        const zipKey = zipPathForUpload(relPath);
        const buf = zipFiles.get(zipKey);
        if (!buf) continue;

        const folder = path.posix.dirname(relPath.replace(/\\/g, "/"));
        const folderArg = folder === "." ? "" : folder;
        const newUrl = await saveUploadBuffer(buf, folderArg, path.basename(relPath));
        pathToNewUrl.set(relPath, newUrl);
    }

    const urlMap = new Map<string, string>();
    const allStrings = new Set<string>();

    const walkStrings = (v: unknown) => {
        if (typeof v === "string") {
            allStrings.add(v);
            return;
        }
        if (Array.isArray(v)) {
            for (const x of v) walkStrings(x);
            return;
        }
        if (v && typeof v === "object") {
            for (const x of Object.values(v as Record<string, unknown>)) walkStrings(x);
        }
    };
    walkStrings(manifest);

    for (const str of allStrings) {
        const rel = uploadPathFromUrl(str);
        if (!rel) continue;
        const newUrl = pathToNewUrl.get(rel);
        if (!newUrl) continue;
        urlMap.set(str, newUrl);
        urlMap.set(toApiUploadUrl(rel), newUrl);
    }

    return urlMap;
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

async function resolveProductIdMap(
    db: Awaited<ReturnType<typeof getDb>>,
    products: Array<Record<string, unknown>>,
    urlMap: Map<string, string>,
): Promise<Map<string, StringRecordId>> {
    const map = new Map<string, StringRecordId>();

    for (const raw of products) {
        const oldKey = exportId(raw);
        const code = raw.code != null ? String(raw.code).trim() : "";
        if (code) {
            const existing = await db.query<[Array<{ id: unknown }>]>(
                "SELECT id FROM product WHERE code = $code LIMIT 1",
                { code },
            );
            const row = existing[0]?.[0];
            if (row?.id) {
                map.set(oldKey, new StringRecordId(String(row.id)));
                continue;
            }
        }

        const payload = replaceUploadUrls({ ...raw }, urlMap) as Record<string, unknown>;
        delete payload._exportId;
        delete payload.id;
        payload.created_at = new Date().toISOString();
        payload.updated_at = new Date().toISOString();

        const created = await db.create(new Table("product")).content(payload);
        const row = Array.isArray(created) ? created[0] : created;
        map.set(oldKey, new StringRecordId(String(row.id)));
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
            const parentKey = resolveRelationExportId(block.parent_id);
            const parentId = parentKey ? blockIdMap.get(parentKey) : undefined;
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
        const locKey = resolveRelationExportId(sec.location_id);
        const locId = locKey ? locationIdMap.get(locKey) : null;
        if (!locId) continue;
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

        const secKey = resolveRelationExportId(item.section_id);
        const blockKey = resolveRelationExportId(item.block_id);
        if (secKey) {
            const secId = sectionIdMap.get(secKey);
            if (secId) content.section_id = secId;
        }
        if (blockKey) {
            const blockId = blockIdMap.get(blockKey);
            if (blockId) content.block_id = blockId;
        }

        const prodKey =
            resolveRelationExportId(item.product_id) ??
            (typeof item.product_id === "string" ? item.product_id : extractProductId(item.product_id));
        if (prodKey && productMap.has(prodKey)) {
            content.product_id = productMap.get(prodKey);
        } else if (typeof item.product_id === "string") {
            content.product_id = item.product_id;
        }

        const created = await db.create(new Table("budget_item")).content(content);
        const row = Array.isArray(created) ? created[0] : created;
        itemIdMap.set(exportId(item), new StringRecordId(String(row.id)));
    }

    const imageIdMap = new Map<string, StringRecordId>();

    for (const img of manifest.images) {
        const locKey = resolveRelationExportId(img.location_id);
        const secKey = resolveRelationExportId(img.section_id);
        const blockKey = resolveRelationExportId(img.block_id);

        const content: Record<string, unknown> = {
            budget_id: newBudgetRecordId,
            url: img.url,
            width: img.width,
            height: img.height,
            order_index: img.order_index ?? Date.now(),
            created_at: new Date().toISOString(),
        };
        if (img.composed_url) content.composed_url = img.composed_url;
        if (img.caption) content.caption = img.caption;
        if (img.editor_viewport != null) content.editor_viewport = img.editor_viewport;
        if (img.figure_frame_orientation) content.figure_frame_orientation = img.figure_frame_orientation;

        if (blockKey) {
            const mapped = blockIdMap.get(blockKey);
            if (!mapped) continue;
            content.block_id = mapped;
        } else if (secKey) {
            const mapped = sectionIdMap.get(secKey);
            if (!mapped) continue;
            content.section_id = mapped;
        } else if (locKey) {
            const mapped = locationIdMap.get(locKey);
            if (!mapped) continue;
            content.location_id = mapped;
        } else {
            continue;
        }

        const created = await db.create(new Table("budget_image")).content(content);
        const row = Array.isArray(created) ? created[0] : created;
        imageIdMap.set(exportId(img), new StringRecordId(String(row.id)));
    }

    for (const ann of manifest.annotations) {
        const imgKey = resolveRelationExportId(ann.image_id);
        const newImageId = imgKey ? imageIdMap.get(imgKey) : null;
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
    if (fileBuffer.length > BUDGET_PACKAGE_MAX_IMPORT_BYTES) {
        return {
            ok: false,
            error: `Arquivo muito grande (máx. ${Math.round(BUDGET_PACKAGE_MAX_IMPORT_BYTES / 1024 / 1024)} MB)`,
            status: 413,
        };
    }

    let manifestRaw: unknown;
    const zipFiles = new Map<string, Buffer>();

    const name = sanitizeFilename(originalName).toLowerCase();
    if (name.endsWith(".zip") || name.endsWith(".pazini.zip")) {
        try {
            const entries = parseZipBuffer(fileBuffer);
            for (const e of entries) {
                zipFiles.set(e.name.replace(/\\/g, "/"), e.data);
            }
            const manifestBuf = zipFiles.get(BUDGET_PACKAGE_MANIFEST);
            if (!manifestBuf) {
                return { ok: false, error: "Pacote inválido: manifest.json ausente", status: 400 };
            }
            manifestRaw = JSON.parse(manifestBuf.toString("utf8"));
        } catch {
            return { ok: false, error: "Arquivo ZIP inválido ou corrompido", status: 400 };
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

    if (!isBudgetPackageManifestV1(manifestRaw)) {
        return { ok: false, error: "Formato de pacote não reconhecido (versão incompatível)", status: 400 };
    }

    let manifest = manifestRaw;
    const exportMode = manifest.exportMode ?? (zipFiles.size <= 1 ? "data" : "full");

    let urlMap = new Map<string, string>();
    if (exportMode !== "data") {
        urlMap = await buildUrlRemapFromZip(manifest, zipFiles);
        manifest = replaceUploadUrls(manifest, urlMap) as BudgetPackageManifestV1;
    }

    const db = await getDb();
    const clientRecordId = await resolveOrCreateClient(db, manifest.client);
    if (!clientRecordId) {
        return { ok: false, error: "Pacote sem dados de cliente", status: 400 };
    }

    const productMap = await resolveProductIdMap(db, manifest.products, urlMap);

    const numberResult = await getNextBudgetNumberAction();
    const nextCode = numberResult.data?.nextNumber ?? String(Date.now());
    const importTitle =
        options?.title?.trim() ||
        `${String(manifest.budget.title ?? "Orçamento importado")} (importado)`;

    const b = manifest.budget;
    const useCompositor = Boolean(b.use_compositor);

    const newBudgetRaw = await db.create(new Table("budget")).content({
        title: importTitle,
        code: nextCode,
        status: "draft",
        total_value: 0,
        client_id: clientRecordId,
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

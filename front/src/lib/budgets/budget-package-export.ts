import fs from "node:fs/promises";
import path from "node:path";
import { StringRecordId } from "surrealdb";
import { getDb, toPlain } from "@/lib/surreal";
import { requireRecordId } from "@/lib/surreal-record-ids";
import { getUploadsRoot } from "@/lib/upload";
import { extractProductId } from "@/actions/budget-hierarchy-helpers";
import {
    BUDGET_PACKAGE_MANIFEST,
    BUDGET_PACKAGE_VERSION,
    type BudgetPackageExportMode,
    DEFAULT_BUDGET_PACKAGE_EXPORT_MODE,
} from "@/lib/budgets/budget-package-constants";
import {
    prepareUploadBytesForExport,
    stripComposedUrlsFromManifestImages,
} from "@/lib/budgets/budget-package-image-prepare";
import { stripRecordForExport } from "@/lib/budgets/budget-package-serialize";
import type { BudgetPackageManifestV1 } from "@/lib/budgets/budget-package-types";
import { collectUploadPaths, zipPathForUpload } from "@/lib/budgets/budget-package-urls";
import { buildZipBuffer, type ZipEntry } from "@/lib/budgets/budget-package-zip";

export type ExportBudgetPackageResult =
    | { ok: true; buffer: Buffer; filename: string; mode: BudgetPackageExportMode }
    | { ok: false; error: string; status: number };

export function parseBudgetPackageExportMode(
    raw: string | null | undefined,
): BudgetPackageExportMode {
    if (raw === "full" || raw === "compact" || raw === "data") return raw;
    return DEFAULT_BUDGET_PACKAGE_EXPORT_MODE;
}

export async function exportBudgetPackage(
    budgetId: string,
    mode: BudgetPackageExportMode = DEFAULT_BUDGET_PACKAGE_EXPORT_MODE,
): Promise<ExportBudgetPackageResult> {
    const db = await getDb();
    const budgetRecordId = requireRecordId("budget", budgetId);

    const budgetRes = await db.query<[Array<Record<string, unknown>>]>(
        "SELECT * FROM $id FETCH client_id",
        { id: budgetRecordId },
    );
    const budgetRow = budgetRes[0]?.[0];
    if (!budgetRow) {
        return { ok: false, error: "Orçamento não encontrado", status: 404 };
    }

    const useCompositor = Boolean(budgetRow.use_compositor);
    const sourceBudgetId = String(budgetRow.id);

    const [blocksRes, locationsRes, sectionsRes, itemsRes, imagesRes] = await Promise.all([
        db.query<[Array<Record<string, unknown>>]>(
            "SELECT * FROM budget_block WHERE budget_id = $budgetId ORDER BY order_index ASC",
            { budgetId: budgetRecordId },
        ),
        db.query<[Array<Record<string, unknown>>]>(
            `SELECT * FROM budget_location WHERE budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC`,
            { budgetId: budgetRecordId },
        ),
        db.query<[Array<Record<string, unknown>>]>(
            `SELECT * FROM budget_section WHERE budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC`,
            { budgetId: budgetRecordId },
        ),
        useCompositor
            ? db.query<[Array<Record<string, unknown>>]>(
                  `SELECT * FROM budget_item WHERE budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC`,
                  { budgetId: budgetRecordId },
              )
            : db.query<[Array<Record<string, unknown>>]>(
                  `SELECT * FROM budget_item WHERE section_id.budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC`,
                  { budgetId: budgetRecordId },
              ),
        db.query<[Array<Record<string, unknown>>]>(
            `SELECT * FROM budget_image WHERE budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC`,
            { budgetId: budgetRecordId },
        ),
    ]);

    const blocks = blocksRes[0] ?? [];
    const locations = locationsRes[0] ?? [];
    const sections = sectionsRes[0] ?? [];
    const items = itemsRes[0] ?? [];
    const rawImages = imagesRes[0] ?? [];
    const images =
        mode === "compact"
            ? stripComposedUrlsFromManifestImages(rawImages.map(stripRecordForExport))
            : rawImages.map(stripRecordForExport);

    const imageIds = rawImages.map((img) => new StringRecordId(String(img.id)));
    let annotations: Array<Record<string, unknown>> = [];
    if (imageIds.length > 0) {
        const annRes = await db.query<[Array<Record<string, unknown>>]>(
            "SELECT * FROM image_annotation WHERE image_id IN $imageIds",
            { imageIds },
        );
        annotations = annRes[0] ?? [];
    }

    let client: Record<string, unknown> | null = null;
    const clientVal = budgetRow.client_id;
    if (clientVal && typeof clientVal === "object" && clientVal !== null && "id" in (clientVal as object)) {
        client = stripRecordForExport(clientVal as Record<string, unknown>);
    } else if (clientVal) {
        const cid = requireRecordId("client", String(clientVal));
        const cRes = await db.query<[Array<Record<string, unknown>>]>("SELECT * FROM $id", { id: cid });
        const cRow = cRes[0]?.[0];
        if (cRow) client = stripRecordForExport(cRow);
    }

    const productIdSet = new Set<string>();
    for (const item of items) {
        const pid = extractProductId(item.product_id);
        if (pid) productIdSet.add(pid);
    }

    const products: Array<Record<string, unknown>> = [];
    for (const pid of productIdSet) {
        try {
            const pRes = await db.query<[Array<Record<string, unknown>>]>("SELECT * FROM $id", {
                id: requireRecordId("product", pid),
            });
            const pRow = pRes[0]?.[0];
            if (pRow) products.push(stripRecordForExport(pRow));
        } catch {
            /* produto removido */
        }
    }

    const budgetExport = { ...stripRecordForExport(budgetRow) };
    delete budgetExport._exportId;
    delete budgetExport.client_id;
    delete budgetExport.parent_budget_id;
    delete budgetExport.root_budget_id;
    delete budgetExport.revision_number;
    delete budgetExport.created_at;
    delete budgetExport.updated_at;
    delete budgetExport.deleted_at;

    const manifest: BudgetPackageManifestV1 = {
        version: BUDGET_PACKAGE_VERSION,
        exportMode: mode,
        exportedAt: new Date().toISOString(),
        sourceBudgetId,
        sourceBudgetCode: budgetRow.code != null ? String(budgetRow.code) : undefined,
        budget: budgetExport,
        client,
        products,
        blocks: blocks.map(stripRecordForExport),
        locations: locations.map(stripRecordForExport),
        sections: sections.map(stripRecordForExport),
        items: items.map(stripRecordForExport),
        images,
        annotations: annotations.map(stripRecordForExport),
    };

    const uploadPaths = new Set<string>();
    collectUploadPaths(manifest, uploadPaths);

    const zipEntries: ZipEntry[] = [
        {
            name: BUDGET_PACKAGE_MANIFEST,
            data: Buffer.from(JSON.stringify(toPlain(manifest)), "utf8"),
        },
    ];

    if (mode !== "data") {
        const uploadsRoot = getUploadsRoot();
        for (const relPath of uploadPaths) {
            const fullPath = path.resolve(uploadsRoot, relPath);
            if (!fullPath.startsWith(uploadsRoot + path.sep)) continue;
            try {
                const raw = await fs.readFile(fullPath);
                const data = await prepareUploadBytesForExport(raw, relPath, mode);
                zipEntries.push({ name: zipPathForUpload(relPath), data });
            } catch {
                console.warn(`[budget-export] arquivo ausente: ${relPath}`);
            }
        }
    }

    const code = String(budgetRow.code ?? "orcamento").replace(/[^\w.-]+/g, "_");
    const suffix = mode === "data" ? "dados" : mode === "compact" ? "compacto" : "completo";
    const filename = `orcamento-${code}-${suffix}.pazini.zip`;

    return { ok: true, buffer: buildZipBuffer(zipEntries), filename, mode };
}

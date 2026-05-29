import path from "node:path";
import sharp from "sharp";
import type { BudgetPackageExportMode } from "@/lib/budgets/budget-package-constants";
import {
    BUDGET_PACKAGE_COMPACT_JPEG_QUALITY,
    BUDGET_PACKAGE_COMPACT_MAX_EDGE,
} from "@/lib/budgets/budget-package-constants";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"]);

export function isRasterImagePath(relPath: string): boolean {
    return IMAGE_EXT.has(path.extname(relPath).toLowerCase());
}

/** Reduz fotos para exportação compacta; demais arquivos passam intactos. */
export async function prepareUploadBytesForExport(
    buffer: Buffer,
    relPath: string,
    mode: BudgetPackageExportMode,
): Promise<Buffer> {
    if (mode !== "compact" || !isRasterImagePath(relPath)) {
        return buffer;
    }

    try {
        return await sharp(buffer, { limitInputPixels: 80_000_000 })
            .rotate()
            .resize(BUDGET_PACKAGE_COMPACT_MAX_EDGE, BUDGET_PACKAGE_COMPACT_MAX_EDGE, {
                fit: "inside",
                withoutEnlargement: true,
            })
            .jpeg({ quality: BUDGET_PACKAGE_COMPACT_JPEG_QUALITY, mozjpeg: true })
            .toBuffer();
    } catch (e) {
        console.warn(`[budget-export] compact skip ${relPath}:`, e);
        return buffer;
    }
}

/** Remove `composed_url` do manifest (cópia achatada costuma dobrar o tamanho do pacote). */
export function stripComposedUrlsFromManifestImages(
    images: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
    return images.map((img) => {
        const next = { ...img };
        delete next.composed_url;
        return next;
    });
}

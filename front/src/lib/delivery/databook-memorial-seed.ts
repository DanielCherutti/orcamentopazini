import fs from "node:fs";
import path from "node:path";
import { saveUploadBuffer } from "@/lib/upload";
import type { DatabookTemplateFile } from "@/types/databook-template-types";

const MEMORIAL_FILENAMES = ["laudos tecnicos.pdf", "laudos-tecnicos.pdf"] as const;

const EXPORT_FILENAME = "laudos-tecnicos-memorial-cvale.pdf";

/** Localiza o PDF do memorial no repositório (raiz ou pasta front). */
export function resolveBuiltinMemorialPdfPath(): string | null {
    const roots = [
        process.cwd(),
        path.resolve(process.cwd(), ".."),
        path.resolve(process.cwd(), "../.."),
    ];

    for (const root of roots) {
        for (const name of MEMORIAL_FILENAMES) {
            const full = path.join(root, name);
            try {
                if (fs.existsSync(full) && fs.statSync(full).isFile()) {
                    return full;
                }
            } catch {
                // ignore
            }
        }
    }
    return null;
}

/** Copia o memorial para uploads e retorna metadados para `reference_file`. */
export async function buildBuiltinMemorialReferenceFile(
    templateId: string,
): Promise<DatabookTemplateFile | null> {
    const sourcePath = resolveBuiltinMemorialPdfPath();
    if (!sourcePath) return null;

    const buffer = await fs.promises.readFile(sourcePath);
    if (!buffer.length) return null;

    const sanitizedId = templateId.replace(":", "_");
    const url = await saveUploadBuffer(
        buffer,
        `databook-templates/${sanitizedId}/reference`,
        EXPORT_FILENAME,
    );

    return {
        id: crypto.randomUUID(),
        filename: EXPORT_FILENAME,
        url,
        type: "application/pdf",
    };
}

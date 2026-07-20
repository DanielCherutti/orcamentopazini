import { safeDownloadFilename } from "@/lib/delivery/delivery-upload-files";

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;

/** Usa o título visível do orçamento sem permitir caracteres inválidos no arquivo. */
export function budgetPdfFilename(title: string | null | undefined): string {
    const safeTitle = (title ?? "")
        .replace(INVALID_FILENAME_CHARS, "_")
        .replace(/\s+/g, " ")
        .replace(/^[._ ]+|[._ ]+$/g, "")
        .slice(0, 120)
        .trim();

    return `${safeTitle || "Proposta comercial"}.pdf`;
}

/** Cabeçalho ASCII com variante UTF-8, preservando acentos nos navegadores modernos. */
export function inlinePdfContentDisposition(filename: string): string {
    const baseName = filename.replace(/\.pdf$/i, "");
    const asciiFallback = `${safeDownloadFilename(baseName, 120)}.pdf`;
    const encodedUtf8 = encodeURIComponent(filename).replace(/[!'()*]/g, (char) =>
        `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );

    return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodedUtf8}`;
}

import type { Buffer } from "node:buffer";

/** Limites alinhados ao item 3 (erros-sistema): evitar abuso de armazenamento. */
export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024; // 5MB — produto pendente, biblioteca, foto produto
export const BUDGET_IMAGE_MAX_BYTES = 20 * 1024 * 1024; // 20MB — foto de orçamento
export const ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024; // 15MB — anexos de produto (PDF + imagens)

export type SniffedKind = "jpeg" | "png" | "gif" | "webp" | "pdf" | "ico";

const IMAGE_KINDS = new Set<SniffedKind>(["jpeg", "png", "gif", "webp"]);

function headerSlice(buf: Buffer): Uint8Array {
    const len = Math.min(16, buf.length);
    return new Uint8Array(buf.buffer, buf.byteOffset, len);
}

/**
 * Identifica tipo real pelo conteúdo (magic bytes), não pelo MIME declarado pelo cliente.
 */
export function sniffUploadKind(header: Uint8Array): SniffedKind | null {
    if (header.length < 4) return null;

    if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
        return "jpeg";
    }

    if (
        header.length >= 8 &&
        header[0] === 0x89 &&
        header[1] === 0x50 &&
        header[2] === 0x4e &&
        header[3] === 0x47 &&
        header[4] === 0x0d &&
        header[5] === 0x0a &&
        header[6] === 0x1a &&
        header[7] === 0x0a
    ) {
        return "png";
    }

    if (
        header.length >= 6 &&
        header[0] === 0x47 &&
        header[1] === 0x49 &&
        header[2] === 0x46 &&
        header[3] === 0x38 &&
        (header[4] === 0x37 || header[4] === 0x39) &&
        header[5] === 0x61
    ) {
        return "gif";
    }

    if (
        header.length >= 12 &&
        header[0] === 0x52 &&
        header[1] === 0x49 &&
        header[2] === 0x46 &&
        header[3] === 0x46 &&
        header[8] === 0x57 &&
        header[9] === 0x45 &&
        header[10] === 0x42 &&
        header[11] === 0x50
    ) {
        return "webp";
    }

    if (
        header.length >= 4 &&
        header[0] === 0 &&
        header[1] === 0 &&
        header[2] === 1 &&
        header[3] === 0
    ) {
        return "ico";
    }

    if (
        header[0] === 0x25 &&
        header[1] === 0x50 &&
        header[2] === 0x44 &&
        header[3] === 0x46
    ) {
        return "pdf";
    }

    return null;
}

function mbLabel(maxBytes: number): string {
    return String(Math.round(maxBytes / 1024 / 1024));
}

const FAVICON_KINDS = new Set<SniffedKind>(["jpeg", "png", "gif", "webp", "ico"]);

export const FAVICON_UPLOAD_MAX_BYTES = 512 * 1024;

export function validateFaviconBuffer(buffer: Buffer): string | null {
    if (buffer.length > FAVICON_UPLOAD_MAX_BYTES) {
        return "Favicon excede o limite de 512KB";
    }
    if (buffer.length < 4) {
        return "Arquivo inválido ou corrompido";
    }
    const kind = sniffUploadKind(headerSlice(buffer));
    if (!kind || !FAVICON_KINDS.has(kind)) {
        return "Use PNG, ICO, WEBP, GIF ou JPG para o favicon.";
    }
    return null;
}

export function validateImageBuffer(
    buffer: Buffer,
    maxBytes: number,
): string | null {
    if (buffer.length > maxBytes) {
        return `Arquivo excede o limite de ${mbLabel(maxBytes)}MB`;
    }
    if (buffer.length < 4) {
        return "Arquivo inválido ou corrompido";
    }
    const kind = sniffUploadKind(headerSlice(buffer));
    if (!kind || !IMAGE_KINDS.has(kind)) {
        return "Tipo não permitido. Use imagem JPG, PNG, GIF ou WEBP.";
    }
    return null;
}

export function validateAttachmentBuffer(
    buffer: Buffer,
    maxBytes: number,
): string | null {
    if (buffer.length > maxBytes) {
        return `Arquivo excede o limite de ${mbLabel(maxBytes)}MB`;
    }
    if (buffer.length < 4) {
        return "Arquivo inválido ou corrompido";
    }
    const kind = sniffUploadKind(headerSlice(buffer));
    if (!kind) {
        return "Tipo não permitido. Use imagem (JPG, PNG, GIF, WEBP) ou PDF.";
    }
    if (!IMAGE_KINDS.has(kind) && kind !== "pdf") {
        return "Tipo não permitido. Use imagem (JPG, PNG, GIF, WEBP) ou PDF.";
    }
    return null;
}

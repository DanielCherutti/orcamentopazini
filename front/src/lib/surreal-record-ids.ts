import { StringRecordId } from "surrealdb";

/** Lançado quando o ID do cliente não passa na validação estrita de formato/tabela. */
export class InvalidRecordIdError extends Error {
    constructor() {
        super("Identificador inválido");
        this.name = "InvalidRecordIdError";
    }
}

/**
 * Tabelas cujos IDs podem ser construídos a partir de entrada do cliente (mitigação IDOR / injeção).
 * Sufixo: apenas [A-Za-z0-9_-], comprimento 1–128 (alinhado a portal_user).
 */
const ALLOWED_TABLES = new Set([
    "budget",
    "client",
    "product",
    "product_group",
    "portal_user",
    "budget_location",
    "budget_section",
    "budget_item",
    "budget_image",
    "budget_block",
    "image_annotation",
    "image_library",
    "proposal_settings",
]);

const SUFFIX_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Monta `StringRecordId` só se tabela e sufixo forem seguros.
 */
export function safeStringRecordId(
    table: string,
    rawId: string,
): StringRecordId | null {
    if (!ALLOWED_TABLES.has(table)) return null;
    const decoded = decodeURIComponent(rawId).trim();
    if (!decoded) return null;

    const suffix = decoded.startsWith(`${table}:`)
        ? decoded.slice(table.length + 1)
        : decoded;

    if (suffix.length === 0 || suffix.length > 128 || !SUFFIX_RE.test(suffix)) {
        return null;
    }

    return new StringRecordId(`${table}:${suffix}`);
}

/** Versão que lança {@link InvalidRecordIdError} em vez de retornar null. */
export function requireRecordId(table: string, rawId: string): StringRecordId {
    const r = safeStringRecordId(table, rawId);
    if (!r) throw new InvalidRecordIdError();
    return r;
}

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
    "portal_user_tenant",
    "tenant",
    "budget_location",
    "budget_section",
    "budget_item",
    "budget_image",
    "budget_block",
    "budget_email_thread",
    "budget_email_message",
    "image_annotation",
    "image_library",
    "proposal_settings",
    "modelos",
    "technical_equipment",
    "delivery_project",
    "delivery_area",
    "delivery_block",
    "delivery_evidence",
    "delivery_installation",
    "databook_template",
    "databook",
    "databook_section",
    "databook_installation",
    "databook_installation_product",
    "databook_media",
    "databook_attachment",
    "product_databook_config",
    "product_manual",
    "document_generation_job",
]);

const SUFFIX_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Converte valor vindo do Surreal/JSON (string, RecordId ou `{ tb, id }`) em `table:suffix`.
 */
export function recordIdToString(id: unknown): string {
    if (id == null) return "";
    if (typeof id === "string") return id;
    if (typeof id === "object" && id !== null) {
        const o = id as Record<string, unknown>;
        if (typeof o.tb === "string" && o.id != null) {
            const inner = o.id;
            const innerStr =
                typeof inner === "string"
                    ? inner
                    : typeof inner === "object" && inner !== null && "tb" in inner
                      ? recordIdToString(inner)
                      : String(inner);
            return `${o.tb}:${innerStr}`;
        }
    }
    return String(id);
}

/**
 * Forma canônica para comparar IDs da mesma tabela (ex.: `uuid` → `product:uuid`).
 */
export function canonicalTableRecordId(table: string, id: unknown): string {
    const s = recordIdToString(id).trim();
    if (!s) return "";
    if (s.startsWith(`${table}:`)) return s;
    if (!s.includes(":") && SUFFIX_RE.test(s)) return `${table}:${s}`;
    return s;
}

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

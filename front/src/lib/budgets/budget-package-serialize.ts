/** Remove metadados SurrealDB e normaliza IDs para exportação JSON. */
export function stripRecordForExport(row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
        if (key === "id") {
            out._exportId = String(value);
            continue;
        }
        out[key] = normalizeExportValue(value);
    }
    return out;
}

function normalizeExportValue(value: unknown): unknown {
    if (value == null) return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") {
        if (Array.isArray(value)) {
            return value.map(normalizeExportValue);
        }
        const o = value as Record<string, unknown>;
        if (o.id != null && typeof o.id === "string" && Object.keys(o).length <= 6) {
            return { _exportId: String(o.id), ...Object.fromEntries(
                Object.entries(o).filter(([k]) => k !== "id").map(([k, v]) => [k, normalizeExportValue(v)])
            ) };
        }
        if (typeof (value as { toString?: () => string }).toString === "function") {
            const s = String(value);
            if (s.includes(":") && !s.startsWith("[object")) return s;
        }
        const plain: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(o)) {
            plain[k] = normalizeExportValue(v);
        }
        return plain;
    }
    return value;
}

export function exportId(row: Record<string, unknown>): string {
    const id = row._exportId ?? row.id;
    return String(id);
}

/** Normaliza ID exportado (Surreal `table:id`, `table⟨id⟩`, UUID puro). */
export function normalizeRelationExportId(value: unknown): string | null {
    if (!value) return null;
    let raw: string | null = null;
    if (typeof value === "string") {
        raw = value;
    } else if (typeof value === "object" && value !== null) {
        const o = value as Record<string, unknown>;
        if (o._exportId != null) raw = String(o._exportId);
        else if (o.id != null) raw = String(o.id);
        else if (typeof (value as { toString?: () => string }).toString === "function") {
            const s = String(value);
            if (s.includes(":") && !s.startsWith("[object")) raw = s;
        }
    }
    if (!raw) return null;
    return raw.replace(/⟨/g, ":").replace(/⟩/g, "").trim();
}

export function resolveRelationExportId(value: unknown): string | null {
    return normalizeRelationExportId(value);
}

/** Busca ID no mapa de duplicação (chave exata ou sufixo `table:id`). */
export function lookupExportIdInMap<T>(
    map: Map<string, T>,
    relationValue: unknown,
): T | undefined {
    const key = normalizeRelationExportId(relationValue);
    if (!key) return undefined;
    if (map.has(key)) return map.get(key);

    const bare = key.includes(":") ? key.split(":").pop()! : key;
    for (const [k, v] of map) {
        const kBare = k.includes(":") ? k.split(":").pop()! : k;
        if (kBare === bare || k.endsWith(`:${bare}`)) return v;
    }
    return undefined;
}

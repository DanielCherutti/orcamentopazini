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

export function resolveRelationExportId(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value === "object" && value !== null) {
        const o = value as Record<string, unknown>;
        if (o._exportId != null) return String(o._exportId);
        if (o.id != null) return String(o.id);
    }
    return null;
}

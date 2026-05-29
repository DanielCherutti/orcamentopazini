const UPLOAD_PATH_IN_STRING =
    /(?:https?:\/\/[^/\s"'<>]+)?\/api\/uploads\/([^\s"'<>]+)|(?:https?:\/\/[^/\s"'<>]+)?\/uploads\/([^\s"'<>]+)/g;

/** Caminho relativo dentro da pasta de uploads (ex.: `budgets/images/uuid.jpg`). */
export function uploadPathFromUrl(url: string): string | null {
    const trimmed = url.trim();
    const m =
        trimmed.match(/\/api\/uploads\/(.+)$/i) ?? trimmed.match(/\/uploads\/(.+)$/i);
    if (!m?.[1]) return null;
    const path = decodeURIComponent(m[1].split("?")[0] ?? "");
    if (!path || path.includes("..")) return null;
    return path;
}

export function toApiUploadUrl(relativePath: string): string {
    return `/api/uploads/${relativePath.replace(/^\/+/, "")}`;
}

/** Coleta caminhos de upload referenciados em um valor JSON arbitrário. */
export function collectUploadPaths(value: unknown, out: Set<string>): void {
    if (value == null) return;

    if (typeof value === "string") {
        for (const match of value.matchAll(UPLOAD_PATH_IN_STRING)) {
            const p = match[1] ?? match[2];
            if (p && !p.includes("..")) out.add(decodeURIComponent(p.split("?")[0] ?? ""));
        }
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) collectUploadPaths(item, out);
        return;
    }

    if (typeof value === "object") {
        for (const v of Object.values(value as Record<string, unknown>)) {
            collectUploadPaths(v, out);
        }
    }
}

/** Substitui URLs de upload em strings e objetos (cópia profunda). */
export function replaceUploadUrls(value: unknown, urlMap: Map<string, string>): unknown {
    if (value == null) return value;

    if (typeof value === "string") {
        let s = value;
        for (const [oldUrl, newUrl] of urlMap) {
            if (s.includes(oldUrl)) s = s.split(oldUrl).join(newUrl);
        }
        return s;
    }

    if (Array.isArray(value)) {
        return value.map((item) => replaceUploadUrls(item, urlMap));
    }

    if (typeof value === "object") {
        const obj = value as Record<string, unknown>;
        const next: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
            next[k] = replaceUploadUrls(v, urlMap);
        }
        return next;
    }

    return value;
}

/** Chave estável no ZIP para um arquivo de upload. */
export function zipPathForUpload(relativePath: string): string {
    return `files/${relativePath.replace(/^\/+/, "")}`;
}

export function zipHasAssetFiles(zipFiles: Map<string, Buffer>): boolean {
    for (const key of zipFiles.keys()) {
        const n = key.replace(/\\/g, "/");
        if (n.startsWith("files/") && n.length > "files/".length) return true;
    }
    return false;
}

/** Converte URL absoluta de outro ambiente para `/api/uploads/...` local. */
export function normalizeUploadUrlToRelative(url: string): string {
    const rel = uploadPathFromUrl(url);
    if (!rel) return url;
    return toApiUploadUrl(rel);
}

/** Normaliza todas as URLs de upload no manifest (host de produção → caminho relativo). */
export function normalizeAllUploadUrlsInValue(value: unknown): unknown {
    if (value == null) return value;

    if (typeof value === "string") {
        return uploadPathFromUrl(value) ? normalizeUploadUrlToRelative(value) : value;
    }

    if (Array.isArray(value)) {
        return value.map((item) => normalizeAllUploadUrlsInValue(item));
    }

    if (typeof value === "object") {
        const obj = value as Record<string, unknown>;
        const next: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
            next[k] = normalizeAllUploadUrlsInValue(v);
        }
        return next;
    }

    return value;
}

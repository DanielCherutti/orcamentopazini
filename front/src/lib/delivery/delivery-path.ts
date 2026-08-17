/**
 * URLs de projetos de entrega — mesmo padrão dos orçamentos: só o sufixo na rota.
 * /delivery-projects/{uuid}  (sem prefixo delivery_project:)
 */

export function deliveryProjectIdToPath(id: string): string {
    if (!id) return "";
    const decoded = decodeURIComponent(id.trim());
    if (decoded.includes(":")) return decoded.split(":")[1] ?? decoded;
    return decoded.replace(/^delivery_project_/, "");
}

/** Converte segmento da URL em id canônico `delivery_project:uuid`. */
export function deliveryProjectIdFromPath(pathSegment: string): string {
    const decoded = decodeURIComponent(pathSegment.trim());
    if (!decoded) return "";
    if (decoded.includes(":")) return decoded;
    const suffix = decoded.replace(/^delivery_project_/, "");
    return `delivery_project:${suffix}`;
}

/**
 * Interpreta segmentos da rota (inclui URLs quebradas em múltiplas partes
 * quando o id continha `:` ou `delivery_project/` no path).
 */
export function parseDeliveryProjectPathSegments(segments: string[]): {
    projectId: string;
    canonicalPath: string;
} {
    const decoded = segments.map((s) => decodeURIComponent(s.trim())).filter(Boolean);
    if (decoded.length === 0) {
        return { projectId: "", canonicalPath: "" };
    }

    if (decoded.length >= 2 && decoded[0] === "delivery_project") {
        const suffix = decoded.slice(1).join("");
        const projectId = deliveryProjectIdFromPath(suffix);
        return { projectId, canonicalPath: deliveryProjectIdToPath(projectId) };
    }

    if (decoded.length === 1) {
        const projectId = deliveryProjectIdFromPath(decoded[0]);
        return { projectId, canonicalPath: deliveryProjectIdToPath(projectId) };
    }

    const suffix = decoded.join("");
    const projectId = deliveryProjectIdFromPath(suffix);
    return { projectId, canonicalPath: deliveryProjectIdToPath(projectId) };
}

export function deliveryProjectUrl(id: string): string {
    const path = deliveryProjectIdToPath(id);
    return path ? `/delivery-projects/${path}` : "/delivery-projects";
}

export function deliveryProjectRevalidatePath(id: string): string {
    if (id.startsWith("databook:")) {
        return `/dashboard/databook-documents/${encodeURIComponent(id)}`;
    }
    return deliveryProjectUrl(id);
}

export function deliveryProjectExportApiUrl(id: string): string {
    return `/api/delivery-projects/${deliveryProjectIdToPath(id)}/export`;
}

export function deliveryProjectPdfApiUrl(id: string): string {
    return `/api/delivery-projects/${deliveryProjectIdToPath(id)}/pdf`;
}

export function deliveryProjectEvidenceUploadApiUrl(id: string): string {
    return `/api/upload/delivery/${deliveryProjectIdToPath(id)}/evidence`;
}

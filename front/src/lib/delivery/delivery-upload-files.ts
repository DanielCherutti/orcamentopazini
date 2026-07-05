import fs from "node:fs/promises";
import path from "node:path";
import { getUploadsRoot } from "@/lib/upload";

export function uploadUrlToRelative(url: string): string | null {
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("/api/uploads/")) {
        return trimmed.slice("/api/uploads/".length);
    }
    if (trimmed.startsWith("uploads/")) {
        return trimmed.slice("uploads/".length);
    }
    return null;
}

export async function readUploadFile(url: string): Promise<Buffer | null> {
    const rel = uploadUrlToRelative(url);
    if (!rel || rel.includes("..")) return null;
    const full = path.join(getUploadsRoot(), rel);
    try {
        return await fs.readFile(full);
    } catch {
        return null;
    }
}

export function safeZipName(name: string): string {
    return name.replace(/[<>:"|?*\\]/g, "_").replace(/\s+/g, "_");
}

/** Nome seguro para `Content-Disposition` — só caracteres ASCII (evita ByteString error). */
export function safeDownloadFilename(name: string, maxLen = 80): string {
    const slug = name
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w.-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, maxLen);
    return slug || "arquivo";
}

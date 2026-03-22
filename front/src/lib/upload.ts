import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

/** Pasta dentro do app Next (`front/uploads/` em dev). Listada em `front/.gitignore` e raiz `.gitignore`. */
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

/**
 * Persiste bytes já validados (uma única leitura do arquivo no handler).
 */
export async function saveUploadBuffer(
    buffer: Buffer,
    folder: string,
    originalName: string,
): Promise<string> {
    const ext = path.extname(originalName) || ".bin";
    const hash = crypto.randomUUID();
    const filename = `${hash}${ext}`;

    const uploadDir = path.join(UPLOADS_DIR, folder);

    try {
        await fs.mkdir(uploadDir, { recursive: true });
        await fs.writeFile(path.join(uploadDir, filename), buffer);
        return `/api/uploads/${folder}/${filename}`;
    } catch (error) {
        console.error("Error saving file:", error);
        throw new Error("Failed to save file");
    }
}

export async function saveFile(file: File, folder: string): Promise<string> {
    const buffer = Buffer.from(await file.arrayBuffer());
    return saveUploadBuffer(buffer, folder, file.name);
}

export async function deleteFile(relativePath: string): Promise<void> {
    if (!relativePath.startsWith("/api/uploads/") && !relativePath.startsWith("/uploads/")) return;

    // Strip the URL prefix to get the file path within uploads/
    const stripped = relativePath
        .replace(/^\/api\/uploads\//, "")
        .replace(/^\/uploads\//, "");

    const fullPath = path.join(UPLOADS_DIR, stripped);

    // Prevent path traversal
    if (!fullPath.startsWith(UPLOADS_DIR)) return;

    try {
        await fs.unlink(fullPath);
    } catch (error) {
        // Ignore if file doesn't exist
        console.warn("Error deleting file:", error);
    }
}

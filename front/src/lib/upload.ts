import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Raiz onde arquivos enviados são gravados.
 * `PAZINI_UPLOADS_DIR` (absoluto) em produção/Docker; senão `front/uploads/` (gitignored na raiz e em `front/.gitignore`).
 */
export function getUploadsRoot(): string {
    const raw = process.env.PAZINI_UPLOADS_DIR?.trim();
    if (raw) {
        return path.resolve(raw);
    }
    return path.resolve(process.cwd(), "uploads");
}

/**
 * Resposta JSON quando mkdir/writeFile falha (permissão, disco somente leitura, etc.).
 */
export function uploadPersistErrorResponse(error: unknown): NextResponse {
    const err = error as NodeJS.ErrnoException;
    const code = err?.code;
    console.error(
        "Erro ao persistir upload:",
        code ?? err?.message ?? error,
        err?.stack,
    );
    if (code === "EACCES" || code === "EROFS") {
        console.error(
            "Dica: Se usar Docker, o diretório de uploads precisa ser gravável pelo usuário do app (uid 1001 / nextjs). " +
                "No host: chown -R 1001:1001 pazini-uploads (ou a pasta montada em /app/uploads).",
        );
        return NextResponse.json(
            {
                error:
                    "O servidor não conseguiu gravar o arquivo (sem permissão no disco). " +
                    "Em Docker, ajuste o dono da pasta montada em uploads, por exemplo: chown -R 1001:1001 pazini-uploads.",
            },
            { status: 500 },
        );
    }
    if (code === "ENOSPC") {
        return NextResponse.json(
            { error: "Espaço em disco insuficiente no servidor." },
            { status: 507 },
        );
    }
    return NextResponse.json({ error: "Falha no upload" }, { status: 500 });
}

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

    const uploadsRoot = getUploadsRoot();
    const uploadDir = path.join(uploadsRoot, folder);

    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, filename), buffer);
    return `/api/uploads/${folder}/${filename}`;
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

    const uploadsRoot = path.resolve(getUploadsRoot());
    const fullPath = path.resolve(uploadsRoot, stripped);

    // Prevent path traversal
    if (!fullPath.startsWith(uploadsRoot + path.sep)) return;

    try {
        await fs.unlink(fullPath);
    } catch (error) {
        // Ignore if file doesn't exist
        console.warn("Error deleting file:", error);
    }
}

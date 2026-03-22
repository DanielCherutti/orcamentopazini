import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getUploadsRoot } from "@/lib/upload";

const MIME_TYPES: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".ico": "image/x-icon",
};

// Headers CORS necessários para que o canvas do Konva possa ler a imagem
// sem ficar "tainted" (o que impede canvas.toBlob()).
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const segments = (await params).path;

    // Block path traversal
    if (segments.some((s) => s === ".." || s.includes("\0"))) {
        return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const uploadsRoot = path.resolve(getUploadsRoot());
    const filePath = path.resolve(uploadsRoot, ...segments);

    // Double-check resolved path is within uploads dir
    if (!filePath.startsWith(uploadsRoot + path.sep)) {
        return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    try {
        const file = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";

        return new NextResponse(file, {
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=31536000, immutable",
                ...CORS_HEADERS,
            },
        });
    } catch {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
}

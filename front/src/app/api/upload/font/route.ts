import { Buffer } from "node:buffer";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { saveUploadBuffer, uploadPersistErrorResponse } from "@/lib/upload";

const MAX_FONT_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".ttf", ".otf", ".woff", ".woff2"]);

function hasValidFontSignature(buffer: Buffer, extension: string): boolean {
  const signature = buffer.subarray(0, 4).toString("ascii");
  if (extension === ".otf") return signature === "OTTO";
  if (extension === ".woff") return signature === "wOFF";
  if (extension === ".woff2") return signature === "wOF2";
  return buffer.length >= 4 && buffer.readUInt32BE(0) === 0x00010000;
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!session.ok) return session.response;
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Nenhuma fonte enviada" }, { status: 400 });
    const extension = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return NextResponse.json({ error: "Formato aceito: TTF, OTF, WOFF ou WOFF2" }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_FONT_BYTES) {
      return NextResponse.json({ error: "A fonte deve ter no máximo 10 MB" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!hasValidFontSignature(buffer, extension)) {
      return NextResponse.json({ error: "Arquivo de fonte inválido" }, { status: 400 });
    }
    const tenantFolder = session.ctx.tenantId.replace(":", "_");
    const url = await saveUploadBuffer(buffer, `library/${tenantFolder}/fonts`, file.name);
    return NextResponse.json({
      url,
      format: extension.slice(1),
      name: path.basename(file.name, extension),
    });
  } catch (error) {
    return uploadPersistErrorResponse(error);
  }
}

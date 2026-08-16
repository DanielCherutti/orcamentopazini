import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { normalizeRouteRecordId, requireProductInTenant } from "@/lib/api-upload-guards";
import { saveUploadBuffer, uploadPersistErrorResponse } from "@/lib/upload";
import { ATTACHMENT_MAX_BYTES, sniffUploadKind } from "@/lib/upload-validation";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireApiSession(request);
    if (!session.ok) return session.response;
    const productId = normalizeRouteRecordId(decodeURIComponent((await params).id), "product");
    const denied = await requireProductInTenant(productId, session.ctx.tenantId);
    if (denied) return denied;
    try {
        const file = (await request.formData()).get("file") as File | null;
        if (!file) return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
        const buffer = Buffer.from(await file.arrayBuffer());
        if (buffer.length > ATTACHMENT_MAX_BYTES) {
            return NextResponse.json({ error: "Manual excede o limite de 15MB" }, { status: 400 });
        }
        if (sniffUploadKind(buffer.subarray(0, 16)) !== "pdf") {
            return NextResponse.json({ error: "O manual deve ser um PDF válido" }, { status: 400 });
        }
        const url = await saveUploadBuffer(
            buffer,
            `products/${productId.replace(":", "_")}/manuals`,
            file.name.toLowerCase().endsWith(".pdf") ? file.name : `${file.name}.pdf`,
        );
        return NextResponse.json({ filename: file.name, url, type: "application/pdf" });
    } catch (error) {
        return uploadPersistErrorResponse(error);
    }
}

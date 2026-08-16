import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { getDb } from "@/lib/surreal";
import { requireRecordId } from "@/lib/surreal-record-ids";
import { saveUploadBuffer, uploadPersistErrorResponse } from "@/lib/upload";
import { BUDGET_IMAGE_MAX_BYTES, validateImageBuffer } from "@/lib/upload-validation";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireApiSession(request);
    if (!session.ok) return session.response;
    const id = decodeURIComponent((await params).id);
    const db = await getDb();
    const rows = await db.query<[Array<{ id: unknown }>]>(
        "SELECT id FROM $id WHERE tenant_id = $tenant AND deleted_at IS NONE",
        { id: requireRecordId("databook", id), tenant: requireRecordId("tenant", session.ctx.tenantId) },
    );
    if (!rows[0]?.[0]) return NextResponse.json({ error: "DataBook não encontrado" }, { status: 404 });
    try {
        const file = (await request.formData()).get("file") as File | null;
        if (!file) return NextResponse.json({ error: "Nenhuma imagem enviada" }, { status: 400 });
        const buffer = Buffer.from(await file.arrayBuffer());
        const validation = validateImageBuffer(buffer, BUDGET_IMAGE_MAX_BYTES);
        if (validation) return NextResponse.json({ error: validation }, { status: 400 });
        const url = await saveUploadBuffer(buffer, `databooks/${id.replace(":", "_")}/media`, file.name);
        return NextResponse.json({ url, filename: file.name, type: file.type || "image/jpeg" });
    } catch (error) {
        return uploadPersistErrorResponse(error);
    }
}

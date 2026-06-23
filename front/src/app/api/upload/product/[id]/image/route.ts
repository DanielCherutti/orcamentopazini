import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { normalizeRouteRecordId, requireProductInTenant } from "@/lib/api-upload-guards";
import { saveUploadBuffer, uploadPersistErrorResponse } from "@/lib/upload";
import {
    IMAGE_UPLOAD_MAX_BYTES,
    validateImageBuffer,
} from "@/lib/upload-validation";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await requireApiSession(request);
    if (!session.ok) return session.response;

    const { id: rawId } = await params;
    const productId = normalizeRouteRecordId(decodeURIComponent(rawId), "product");
    const denied = await requireProductInTenant(productId, session.ctx.tenantId);
    if (denied) return denied;

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const validationError = validateImageBuffer(buffer, IMAGE_UPLOAD_MAX_BYTES);
        if (validationError) {
            return NextResponse.json({ error: validationError }, { status: 400 });
        }

        const sanitizedId = productId.replace(":", "_");
        const url = await saveUploadBuffer(buffer, `products/${sanitizedId}`, file.name);

        return NextResponse.json({ url });
    } catch (error) {
        return uploadPersistErrorResponse(error);
    }
}

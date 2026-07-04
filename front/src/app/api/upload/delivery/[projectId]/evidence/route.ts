import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import {
    normalizeRouteRecordId,
    requireDeliveryProjectInTenant,
} from "@/lib/api-upload-guards";
import { saveUploadBuffer, uploadPersistErrorResponse } from "@/lib/upload";
import {
    ATTACHMENT_MAX_BYTES,
    validateAttachmentBuffer,
} from "@/lib/upload-validation";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> },
) {
    const session = await requireApiSession(request);
    if (!session.ok) return session.response;

    const { projectId: rawId } = await params;
    const projectId = normalizeRouteRecordId(
        decodeURIComponent(rawId),
        "delivery_project",
    );
    const denied = await requireDeliveryProjectInTenant(projectId, session.ctx.tenantId);
    if (denied) return denied;

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        if (!file) {
            return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const validationError = validateAttachmentBuffer(buffer, ATTACHMENT_MAX_BYTES);
        if (validationError) {
            return NextResponse.json({ error: validationError }, { status: 400 });
        }

        const sanitizedId = projectId.replace(":", "_");
        const url = await saveUploadBuffer(
            buffer,
            `delivery/${sanitizedId}/evidence`,
            file.name,
        );

        return NextResponse.json({
            filename: file.name,
            url,
            type: file.type || "application/octet-stream",
        });
    } catch (error) {
        return uploadPersistErrorResponse(error);
    }
}

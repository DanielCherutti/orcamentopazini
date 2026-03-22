import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { saveUploadBuffer, uploadPersistErrorResponse } from "@/lib/upload";
import {
    ATTACHMENT_MAX_BYTES,
    validateAttachmentBuffer,
} from "@/lib/upload-validation";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await requireApiSession(request);
    if (!session.ok) return session.response;

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

        const { id } = await params;
        const sanitizedId = id.replace(":", "_");
        const url = await saveUploadBuffer(
            buffer,
            `products/${sanitizedId}/attachments`,
            file.name,
        );

        return NextResponse.json({
            filename: file.name,
            url,
            type: file.type,
        });
    } catch (error) {
        return uploadPersistErrorResponse(error);
    }
}

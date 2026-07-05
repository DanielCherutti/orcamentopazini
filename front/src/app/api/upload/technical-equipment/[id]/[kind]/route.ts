import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import {
    normalizeRouteRecordId,
    requireTechnicalEquipmentInTenant,
} from "@/lib/api-upload-guards";
import { saveUploadBuffer, uploadPersistErrorResponse } from "@/lib/upload";
import {
    ATTACHMENT_MAX_BYTES,
    validateAttachmentBuffer,
} from "@/lib/upload-validation";

type FileKind = "manual" | "datasheet" | "certificate" | "image";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; kind: string }> },
) {
    const session = await requireApiSession(request);
    if (!session.ok) return session.response;

    const { id: rawId, kind: rawKind } = await params;
    const kind = rawKind as FileKind;
    if (!["manual", "datasheet", "certificate", "image"].includes(kind)) {
        return NextResponse.json({ error: "Tipo de arquivo inválido" }, { status: 400 });
    }

    const equipmentId = normalizeRouteRecordId(
        decodeURIComponent(rawId),
        "technical_equipment",
    );
    const denied = await requireTechnicalEquipmentInTenant(
        equipmentId,
        session.ctx.tenantId,
    );
    if (denied) return denied;

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        if (!file) {
            return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const maxBytes = kind === "image" ? 5 * 1024 * 1024 : ATTACHMENT_MAX_BYTES;
        const validationError = validateAttachmentBuffer(buffer, maxBytes);
        if (validationError) {
            return NextResponse.json({ error: validationError }, { status: 400 });
        }

        if (kind === "manual" && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
            return NextResponse.json(
                { error: "O manual deve ser um arquivo PDF" },
                { status: 400 },
            );
        }

        const sanitizedId = equipmentId.replace(":", "_");
        const folder =
            kind === "image"
                ? `technical-equipment/${sanitizedId}`
                : `technical-equipment/${sanitizedId}/${kind}`;
        const url = await saveUploadBuffer(buffer, folder, file.name);

        return NextResponse.json({
            id: crypto.randomUUID(),
            filename: file.name,
            url,
            type: file.type || "application/octet-stream",
        });
    } catch (error) {
        return uploadPersistErrorResponse(error);
    }
}

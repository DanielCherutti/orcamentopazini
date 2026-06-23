import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { saveUploadBuffer, uploadPersistErrorResponse } from "@/lib/upload";
import {
    FAVICON_UPLOAD_MAX_BYTES,
    IMAGE_UPLOAD_MAX_BYTES,
    validateFaviconBuffer,
    validateImageBuffer,
} from "@/lib/upload-validation";

export async function POST(request: NextRequest) {
    const session = await requireApiSession(request);
    if (!session.ok) return session.response;

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const asset = String(formData.get("asset") ?? "logo").trim();
        const validationError =
            asset === "favicon"
                ? validateFaviconBuffer(buffer)
                : validateImageBuffer(buffer, IMAGE_UPLOAD_MAX_BYTES);
        if (validationError) {
            return NextResponse.json({ error: validationError }, { status: 400 });
        }

        const tenantFolder = session.ctx.tenantId.replace(":", "_");
        const subfolder = asset === "favicon" ? "brand/favicon" : "brand/logo";
        const url = await saveUploadBuffer(buffer, `library/${tenantFolder}/${subfolder}`, file.name);

        return NextResponse.json({ url });
    } catch (error) {
        return uploadPersistErrorResponse(error);
    }
}

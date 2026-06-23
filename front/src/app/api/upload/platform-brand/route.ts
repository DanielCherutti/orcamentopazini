import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";

import { resolveTenantRef } from "@/actions/platform-helpers";
import { platformRoleHasPermission } from "@/lib/platform-permissions";
import { getSessionContext } from "@/lib/tenant-context";
import { getDb } from "@/lib/surreal";
import { saveUploadBuffer, uploadPersistErrorResponse } from "@/lib/upload";
import {
    FAVICON_UPLOAD_MAX_BYTES,
    IMAGE_UPLOAD_MAX_BYTES,
    validateFaviconBuffer,
    validateImageBuffer,
} from "@/lib/upload-validation";

export async function POST(request: NextRequest) {
    const ctx = await getSessionContext();
    if (!ctx?.platformRole || !platformRoleHasPermission(ctx.platformRole, "orgs.write")) {
        return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const tenantRef = String(formData.get("tenantId") ?? "").trim();
        const asset = String(formData.get("asset") ?? "logo").trim();

        if (!file) {
            return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
        }
        if (!tenantRef) {
            return NextResponse.json({ error: "Organização inválida" }, { status: 400 });
        }

        const db = await getDb();
        const rid = await resolveTenantRef(db, tenantRef);
        const tenantFolder = String(rid).replace(":", "_");

        const buffer = Buffer.from(await file.arrayBuffer());
        const validationError =
            asset === "favicon"
                ? validateFaviconBuffer(buffer)
                : validateImageBuffer(buffer, IMAGE_UPLOAD_MAX_BYTES);
        if (validationError) {
            return NextResponse.json({ error: validationError }, { status: 400 });
        }

        const subfolder = asset === "favicon" ? "brand/favicon" : "brand/logo";
        const url = await saveUploadBuffer(buffer, `library/${tenantFolder}/${subfolder}`, file.name);

        return NextResponse.json({ url });
    } catch (error) {
        return uploadPersistErrorResponse(error);
    }
}

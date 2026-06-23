import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { requireBudgetInTenant } from "@/lib/api-upload-guards";
import { saveUploadBuffer, uploadPersistErrorResponse } from "@/lib/upload";
import {
    BUDGET_IMAGE_MAX_BYTES,
    validateImageBuffer,
} from "@/lib/upload-validation";

export async function POST(request: NextRequest) {
    const session = await requireApiSession(request);
    if (!session.ok) return session.response;

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const budgetIdRaw = formData.get("budgetId")?.toString().trim() ?? "";

        if (!file) {
            return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
        }

        if (!budgetIdRaw) {
            return NextResponse.json(
                { error: "Identificador do orçamento é obrigatório" },
                { status: 400 },
            );
        }

        const denied = await requireBudgetInTenant(budgetIdRaw, session.ctx.tenantId);
        if (denied) return denied;

        const buffer = Buffer.from(await file.arrayBuffer());
        const validationError = validateImageBuffer(buffer, BUDGET_IMAGE_MAX_BYTES);
        if (validationError) {
            return NextResponse.json({ error: validationError }, { status: 400 });
        }

        const tenantFolder = session.ctx.tenantId.replace(":", "_");
        const url = await saveUploadBuffer(
            buffer,
            `budgets/${tenantFolder}/images`,
            file.name,
        );
        return NextResponse.json({ url });
    } catch (error) {
        return uploadPersistErrorResponse(error);
    }
}

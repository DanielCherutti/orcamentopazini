import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { saveUploadBuffer } from "@/lib/upload";
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

        if (!file) {
            return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const validationError = validateImageBuffer(buffer, BUDGET_IMAGE_MAX_BYTES);
        if (validationError) {
            return NextResponse.json({ error: validationError }, { status: 400 });
        }

        const url = await saveUploadBuffer(buffer, "budgets/images", file.name);
        return NextResponse.json({ url });
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        console.error(
            "Erro no upload de imagem do orçamento:",
            err?.code ?? err?.message ?? error,
            err?.stack,
        );
        if (err?.code === "EACCES") {
            console.error(
                "Dica: Se usar Docker, o diretório uploads precisa ser gravável. " +
                    "No host: chown -R 1001:1001 pazini-uploads",
            );
        }
        return NextResponse.json({ error: "Falha no upload" }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { saveFile } from "@/lib/upload";

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
        }

        if (!file.type.startsWith("image/")) {
            return NextResponse.json({ error: "Arquivo não é uma imagem" }, { status: 400 });
        }

        if (file.size > MAX_SIZE_BYTES) {
            return NextResponse.json({ error: "Arquivo excede 20MB" }, { status: 400 });
        }

        const url = await saveFile(file, "budgets/images");
        return NextResponse.json({ url });
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        console.error(
            "Erro no upload de imagem do orçamento:",
            err?.code ?? err?.message ?? error,
            err?.stack
        );
        if (err?.code === "EACCES") {
            console.error(
                "Dica: Se usar Docker, o diretório uploads precisa ser gravável. " +
                "No host: chown -R 1001:1001 pazini-uploads"
            );
        }
        return NextResponse.json({ error: "Falha no upload" }, { status: 500 });
    }
}

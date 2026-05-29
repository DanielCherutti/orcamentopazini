import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { assertApiSession } from "@/lib/api-session";
import { importBudgetPackage } from "@/lib/budgets/budget-package-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Importação completa pode levar vários minutos (ZIP grande + muitas imagens). */
export const maxDuration = 900;

function isTruncatedMultipartBodyError(error: unknown): boolean {
    if (!(error instanceof TypeError)) return false;
    const msg = error.message.toLowerCase();
    if (msg.includes("formdata")) return true;
    const cause = error.cause;
    if (cause instanceof TypeError) {
        const causeMsg = cause.message.toLowerCase();
        return causeMsg.includes("boundary") || causeMsg.includes("multipart");
    }
    return false;
}

export async function POST(request: Request) {
    const auth = await assertApiSession();
    if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    try {
        const formData = await request.formData();
        const fileField = formData.get("file");
        const title = formData.get("title")?.toString();

        if (!fileField || typeof fileField === "string") {
            return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });
        }

        const uploadBlob = fileField as Blob;
        const originalName =
            typeof (fileField as File).name === "string" && (fileField as File).name
                ? (fileField as File).name
                : "import.pazini.zip";

        const buffer = Buffer.from(await uploadBlob.arrayBuffer());
        if (buffer.length < 4) {
            return NextResponse.json({ error: "Arquivo vazio ou upload incompleto" }, { status: 400 });
        }

        const result = await importBudgetPackage(buffer, originalName, {
            title: title?.trim() || undefined,
        });

        if (!result.ok) {
            console.warn("[budget-import] rejected:", result.error, { bytes: buffer.length, name: originalName });
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        revalidatePath("/budgets");

        return NextResponse.json({
            success: true,
            budgetId: result.budgetId,
            title: result.title,
        });
    } catch (error) {
        console.error("[budget-import]", error);
        if (isTruncatedMultipartBodyError(error)) {
            return NextResponse.json(
                {
                    error:
                        "Upload interrompido (corpo da requisição truncado). Reinicie o servidor após alterar next.config e confira proxyClientMaxBodySize.",
                },
                { status: 413 },
            );
        }
        return NextResponse.json({ error: "Erro ao importar orçamento" }, { status: 500 });
    }
}

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { assertApiSession } from "@/lib/api-session";
import { importBudgetPackage } from "@/lib/budgets/budget-package-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const auth = await assertApiSession();
    if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    try {
        const formData = await request.formData();
        const file = formData.get("file");
        const title = formData.get("title")?.toString();

        if (!file || !(file instanceof File)) {
            return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await importBudgetPackage(buffer, file.name, {
            title: title?.trim() || undefined,
        });

        if (!result.ok) {
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
        return NextResponse.json({ error: "Erro ao importar orçamento" }, { status: 500 });
    }
}

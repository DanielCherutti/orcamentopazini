import { NextResponse } from "next/server";
import { assertApiSession } from "@/lib/api-session";
import {
    exportBudgetPackage,
    parseBudgetPackageExportMode,
} from "@/lib/budgets/budget-package-export";
import { InvalidRecordIdError } from "@/lib/surreal-record-ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
    request: Request,
    context: { params: Promise<{ id: string }> },
) {
    const auth = await assertApiSession();
    if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const mode = parseBudgetPackageExportMode(new URL(request.url).searchParams.get("mode"));

    try {
        const result = await exportBudgetPackage(id, mode);
        if (!result.ok) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        return new NextResponse(new Uint8Array(result.buffer), {
            status: 200,
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename="${result.filename}"`,
                "Cache-Control": "private, no-store",
            },
        });
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        console.error("[budget-export]", error);
        return NextResponse.json({ error: "Erro ao exportar orçamento" }, { status: 500 });
    }
}

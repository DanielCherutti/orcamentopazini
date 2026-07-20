import { NextResponse } from "next/server";
import { generateBudgetPdfBuffer } from "@/lib/pdf/generate-budget-pdf-buffer";
import { inlinePdfContentDisposition } from "@/lib/pdf/pdf-filename";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const pdfRequestOrigin = new URL(request.url).origin;
    const result = await generateBudgetPdfBuffer(id, { pdfRequestOrigin });

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return new NextResponse(new Uint8Array(result.buffer), {
        status: 200,
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": inlinePdfContentDisposition(result.filename),
            "Cache-Control": "private, no-store",
        },
    });
}

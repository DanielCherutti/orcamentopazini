import { NextResponse } from "next/server";
import { assertApiSession } from "@/lib/api-session";
import { normalizeRouteRecordId } from "@/lib/api-upload-guards";
import { generateDeliveryDatabookPdfBuffer } from "@/lib/delivery/generate-delivery-databook-pdf-buffer";
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
    const projectId = normalizeRouteRecordId(decodeURIComponent(id), "delivery_project");
    const pdfRequestOrigin = new URL(request.url).origin;

    try {
        const result = await generateDeliveryDatabookPdfBuffer(projectId, { pdfRequestOrigin });
        if (!result.ok) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        return new NextResponse(new Uint8Array(result.buffer), {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename="${result.filename}"`,
                "Cache-Control": "private, no-store",
            },
        });
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        console.error("[delivery-pdf]", error);
        return NextResponse.json({ error: "Erro ao gerar PDF" }, { status: 500 });
    }
}

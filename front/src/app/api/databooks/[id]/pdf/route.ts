import { NextResponse } from "next/server";
import { generateDatabookPdf } from "@/lib/databooks/generate-databook-pdf";
import { inlinePdfContentDisposition } from "@/lib/pdf/pdf-filename";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const result = await generateDatabookPdf(decodeURIComponent((await params).id));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return new NextResponse(new Uint8Array(result.buffer), {
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": inlinePdfContentDisposition(result.filename),
            "Cache-Control": "private, no-store",
        },
    });
}

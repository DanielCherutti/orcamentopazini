import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { claimAndRunGenerationJob, type GenerationDocumentType } from "@/lib/document-generation";
import { getDb } from "@/lib/surreal";
import { recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireApiSession(request);
    if (!session.ok) return session.response;
    const jobId = decodeURIComponent((await params).id);
    const db = await getDb();
    const rows = await db.query<[Array<Record<string, unknown>>]>(
        "SELECT * FROM $id WHERE tenant_id = $tenant LIMIT 1",
        {
            id: requireRecordId("document_generation_job", jobId),
            tenant: requireRecordId("tenant", session.ctx.tenantId),
        },
    );
    const job = rows[0]?.[0];
    if (!job) return NextResponse.json({ error: "Geração não encontrada" }, { status: 404 });
    const documentType = String(job.document_type) as GenerationDocumentType;
    if (documentType !== "budget" && documentType !== "databook") {
        return NextResponse.json({ error: "Tipo de documento inválido" }, { status: 400 });
    }
    const result = await claimAndRunGenerationJob(jobId, {
        documentType,
        documentId: recordIdToString(job.document_id),
        totalItems: Math.max(1, Number(job.total_items ?? 1)),
        origin: request.nextUrl.origin,
    });
    return NextResponse.json(result, { status: result.started ? 200 : 202 });
}

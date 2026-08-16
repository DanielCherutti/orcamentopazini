import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { assertEntityInActiveTenant } from "@/lib/tenant-access";
import { createGenerationJob, type GenerationDocumentType } from "@/lib/document-generation";
import { getDb } from "@/lib/surreal";
import { requireRecordId } from "@/lib/surreal-record-ids";

export async function POST(request: NextRequest) {
    const session = await requireApiSession(request);
    if (!session.ok) return session.response;
    const body = await request.json().catch(() => null) as { documentType?: string; documentId?: string } | null;
    const documentType = body?.documentType as GenerationDocumentType;
    const documentId = body?.documentId?.trim();
    if (!documentId || (documentType !== "budget" && documentType !== "databook")) {
        return NextResponse.json({ error: "Documento inválido" }, { status: 400 });
    }
    const gate = await assertEntityInActiveTenant(documentType, documentId);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 404 });
    const db = await getDb();
    const activeRows = await db.query<[Array<{ id: unknown; created_at?: string }>]>(
        `SELECT id, created_at FROM document_generation_job WHERE tenant_id = $tenant
         AND document_type = $documentType AND document_id = $document
         AND status IN ["queued", "preparing", "rendering_content", "rendering_installations", "processing_images", "merging_manuals", "building_indexes", "finalizing"]
         ORDER BY created_at DESC LIMIT 1`,
        {
            tenant: requireRecordId("tenant", session.ctx.tenantId),
            documentType,
            document: requireRecordId(documentType, documentId),
        },
    );
    if (activeRows[0]?.[0]?.id) {
        return NextResponse.json({ jobId: String(activeRows[0][0].id), reused: true }, { status: 202 });
    }
    const countQuery = documentType === "databook"
        ? "SELECT count() FROM databook_installation WHERE databook_id = $id AND deleted_at IS NONE GROUP ALL"
        : "SELECT count() FROM budget_location WHERE budget_id = $id AND deleted_at IS NONE GROUP ALL";
    const count = await db.query<[Array<{ count?: number }>]>(countQuery, { id: requireRecordId(documentType, documentId) });
    const totalItems = Math.max(1, Number(count[0]?.[0]?.count ?? 1));
    const jobId = await createGenerationJob({
        documentType,
        documentId,
        tenantId: session.ctx.tenantId,
        requestedBy: session.ctx.email,
        totalItems,
    });
    return NextResponse.json({ jobId }, { status: 202 });
}

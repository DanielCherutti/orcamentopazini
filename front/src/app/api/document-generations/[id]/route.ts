import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { getDb, toPlain } from "@/lib/surreal";
import { recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireApiSession(request);
    if (!session.ok) return session.response;
    const db = await getDb();
    const rows = await db.query<[Array<Record<string, unknown>>]>(
        "SELECT * FROM $id WHERE tenant_id = $tenant LIMIT 1",
        {
            id: requireRecordId("document_generation_job", decodeURIComponent((await params).id)),
            tenant: requireRecordId("tenant", session.ctx.tenantId),
        },
    );
    const row = rows[0]?.[0];
    if (!row) return NextResponse.json({ error: "Geração não encontrada" }, { status: 404 });
    return NextResponse.json(toPlain({ ...row, id: recordIdToString(row.id) }));
}

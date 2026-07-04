import { NextResponse } from "next/server";
import { assertApiSession } from "@/lib/api-session";
import { exportDeliveryPackage } from "@/lib/delivery/delivery-package-export";
import { InvalidRecordIdError } from "@/lib/surreal-record-ids";
import { normalizeRouteRecordId } from "@/lib/api-upload-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
    _request: Request,
    context: { params: Promise<{ id: string }> },
) {
    const auth = await assertApiSession();
    if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const projectId = normalizeRouteRecordId(decodeURIComponent(id), "delivery_project");

    try {
        const result = await exportDeliveryPackage(projectId);
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
        console.error("[delivery-export]", error);
        return NextResponse.json({ error: "Erro ao exportar pacote" }, { status: 500 });
    }
}

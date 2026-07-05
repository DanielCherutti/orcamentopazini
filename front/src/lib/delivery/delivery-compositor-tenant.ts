import type { Surreal } from "surrealdb";
import { getDb } from "@/lib/surreal";
import { assertEntityInActiveTenant } from "@/lib/tenant-access";
import { InvalidRecordIdError, recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";

export type DeliveryProjectTenantGate =
    | { ok: true; projectRecordId: ReturnType<typeof requireRecordId> }
    | { ok: false; error: string };

export async function assertDeliveryProjectInActiveTenant(
    projectId: string,
    db?: Surreal,
): Promise<DeliveryProjectTenantGate> {
    const gate = await assertEntityInActiveTenant(
        "delivery_project",
        projectId,
        "Projeto não encontrado",
        db,
    );
    if (!gate.ok) return { ok: false, error: gate.error };
    try {
        return {
            ok: true,
            projectRecordId: requireRecordId("delivery_project", projectId),
        };
    } catch (e) {
        if (e instanceof InvalidRecordIdError) {
            return { ok: false, error: e.message };
        }
        throw e;
    }
}

export async function assertDeliveryBlockInActiveTenant(
    blockId: string,
    expectedProjectId?: string,
    db?: Surreal,
): Promise<DeliveryProjectTenantGate> {
    try {
        const database = db ?? (await getDb());
        const blockRecordId = requireRecordId("delivery_block", blockId);
        const res = await database.query<[Array<{ delivery_project_id?: unknown }>]>(
            `SELECT delivery_project_id FROM delivery_block WHERE id = $id LIMIT 1`,
            { id: blockRecordId },
        );
        const row = res[0]?.[0];
        if (!row?.delivery_project_id) {
            return { ok: false, error: "Bloco não encontrado" };
        }
        const projectId = recordIdToString(row.delivery_project_id);
        if (expectedProjectId && projectId !== recordIdToString(expectedProjectId)) {
            return { ok: false, error: "Bloco não encontrado" };
        }
        return assertDeliveryProjectInActiveTenant(projectId, database);
    } catch (e) {
        if (e instanceof InvalidRecordIdError) {
            return { ok: false, error: e.message };
        }
        throw e;
    }
}

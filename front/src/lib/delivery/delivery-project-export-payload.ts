import { getDb } from "@/lib/surreal";
import { requireRecordId, recordIdToString } from "@/lib/surreal-record-ids";
import { assertEntityInActiveTenant } from "@/lib/tenant-access";
import { getTechnicalEquipmentCategoryLabel } from "@/lib/technical-equipment/categories";
import type {
    DeliveryArea,
    DeliveryChecklistItem,
    DeliveryEvidence,
    DeliveryInstallation,
    DeliveryProject,
} from "@/types/delivery-types";

export type DeliveryProjectExportPayload = {
    project: DeliveryProject;
    areas: DeliveryArea[];
    evidences: DeliveryEvidence[];
    installations: DeliveryInstallation[];
    evidenceByArea: Map<string, DeliveryEvidence[]>;
    equipmentMap: Map<string, Record<string, unknown>>;
    databookReference?: { url: string; filename?: string };
};

export type LoadDeliveryProjectExportPayloadResult =
    | { ok: true; payload: DeliveryProjectExportPayload }
    | { ok: false; error: string; status: number };

export async function loadDeliveryProjectExportPayload(
    projectId: string,
): Promise<LoadDeliveryProjectExportPayloadResult> {
    const gate = await assertEntityInActiveTenant("delivery_project", projectId);
    if (!gate.ok) {
        return { ok: false, error: gate.error, status: 404 };
    }

    const db = await getDb();
    const projectRecordId = requireRecordId("delivery_project", projectId);

    const projectRes = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM delivery_project WHERE id = $id FETCH budget_id, client_id, databook_template_id`,
        { id: projectRecordId },
    );
    const projectRow = projectRes[0]?.[0];
    if (!projectRow) {
        return { ok: false, error: "Projeto não encontrado", status: 404 };
    }

    const budget = projectRow.budget_id as Record<string, unknown> | string | undefined;
    const client = projectRow.client_id as Record<string, unknown> | string | undefined;
    const databook = projectRow.databook_template_id as Record<string, unknown> | undefined;

    const project: DeliveryProject = {
        id: recordIdToString(projectRow.id),
        budget_id: recordIdToString(typeof budget === "object" && budget ? budget.id : budget),
        client_id: client
            ? recordIdToString(typeof client === "object" ? client.id : client)
            : undefined,
        title: String(projectRow.title ?? "Projeto de entrega"),
        contract_ref: projectRow.contract_ref ? String(projectRow.contract_ref) : undefined,
        status: (projectRow.status as DeliveryProject["status"]) ?? "planning",
        gestor_nome: projectRow.gestor_nome ? String(projectRow.gestor_nome) : undefined,
        gestor_phone: projectRow.gestor_phone ? String(projectRow.gestor_phone) : undefined,
        deadline_days:
            projectRow.deadline_days != null ? Number(projectRow.deadline_days) : undefined,
        notes: projectRow.notes ? String(projectRow.notes) : undefined,
        budget_code:
            typeof budget === "object" && budget?.code ? String(budget.code) : undefined,
        client_name:
            typeof client === "object" && client?.name ? String(client.name) : undefined,
        databook_template_name: databook?.name
            ? String(databook.name)
            : projectRow.databook_template_name
              ? String(projectRow.databook_template_name)
              : undefined,
    };

    const [areasRes, evidenceRes, installationsRes] = await Promise.all([
        db.query<[Array<Record<string, unknown>>]>(
            `SELECT * FROM delivery_area WHERE delivery_project_id = $pid ORDER BY sort_order ASC`,
            { pid: projectRecordId },
        ),
        db.query<[Array<Record<string, unknown>>]>(
            `SELECT * FROM delivery_evidence WHERE delivery_project_id = $pid ORDER BY created_at ASC`,
            { pid: projectRecordId },
        ),
        db.query<[Array<Record<string, unknown>>]>(
            `SELECT * FROM delivery_installation WHERE delivery_project_id = $pid`,
            { pid: projectRecordId },
        ),
    ]);

    const areas: DeliveryArea[] = (areasRes[0] ?? []).map((row) => ({
        id: recordIdToString(row.id),
        delivery_project_id: projectId,
        code: String(row.code ?? ""),
        title: String(row.title ?? ""),
        description: row.description ? String(row.description) : undefined,
        status: (row.status as DeliveryArea["status"]) ?? "pending",
        sort_order: Number(row.sort_order ?? 0),
        checklist: Array.isArray(row.checklist) ? (row.checklist as DeliveryChecklistItem[]) : [],
    }));

    const evidences: DeliveryEvidence[] = (evidenceRes[0] ?? []).map((row) => ({
        id: recordIdToString(row.id),
        delivery_project_id: projectId,
        delivery_area_id: row.delivery_area_id
            ? recordIdToString(row.delivery_area_id)
            : undefined,
        kind: (row.kind as DeliveryEvidence["kind"]) ?? "other",
        filename: String(row.filename ?? "arquivo"),
        url: String(row.url ?? ""),
        type: String(row.type ?? ""),
        caption: row.caption ? String(row.caption) : undefined,
        created_at: row.created_at ? String(row.created_at) : undefined,
    }));

    const equipmentIds = new Set<string>();
    const installationRows = installationsRes[0] ?? [];
    for (const row of installationRows) {
        const eqId = recordIdToString(row.technical_equipment_id);
        if (eqId) equipmentIds.add(eqId);
    }

    const equipmentMap = new Map<string, Record<string, unknown>>();
    for (const eqId of equipmentIds) {
        const eqRes = await db.select(requireRecordId("technical_equipment", eqId));
        const eqRow = Array.isArray(eqRes) ? eqRes[0] : eqRes;
        if (eqRow) equipmentMap.set(eqId, eqRow as Record<string, unknown>);
    }

    const installations: DeliveryInstallation[] = installationRows.map((row) => {
        const eqId = recordIdToString(row.technical_equipment_id);
        const eq = eqId ? equipmentMap.get(eqId) : undefined;
        return {
            id: recordIdToString(row.id),
            delivery_project_id: projectId,
            delivery_area_id: recordIdToString(row.delivery_area_id) ?? "",
            technical_equipment_id: eqId ?? "",
            quantity: Number(row.quantity ?? 1),
            tag: row.tag ? String(row.tag) : undefined,
            serial_number: row.serial_number ? String(row.serial_number) : undefined,
            notes: row.notes ? String(row.notes) : undefined,
            include_manual_in_export: row.include_manual_in_export !== false,
            equipment_code: eq?.code ? String(eq.code) : undefined,
            equipment_description: eq?.description ? String(eq.description) : undefined,
            equipment_manufacturer: eq?.manufacturer ? String(eq.manufacturer) : undefined,
            equipment_model: eq?.model ? String(eq.model) : undefined,
        };
    });

    const evidenceByArea = new Map<string, DeliveryEvidence[]>();
    for (const ev of evidences) {
        const key = ev.delivery_area_id ?? "_global";
        if (!evidenceByArea.has(key)) evidenceByArea.set(key, []);
        evidenceByArea.get(key)!.push(ev);
    }

    const ref = databook?.reference_file as Record<string, unknown> | undefined;
    const databookReference =
        ref?.url && String(ref.url).trim()
            ? {
                  url: String(ref.url),
                  filename: ref.filename ? String(ref.filename) : undefined,
              }
            : undefined;

    return {
        ok: true,
        payload: {
            project,
            areas,
            evidences,
            installations,
            evidenceByArea,
            equipmentMap,
            databookReference,
        },
    };
}

export function formatEquipmentCsvLine(id: string, eq: Record<string, unknown>): string {
    const cat = eq.category ? getTechnicalEquipmentCategoryLabel(String(eq.category)) : "";
    return `${eq.code ?? id};${eq.manufacturer ?? ""};${eq.model ?? ""};${cat}`;
}

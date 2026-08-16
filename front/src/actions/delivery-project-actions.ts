"use server";

import { revalidatePath } from "next/cache";
import { Table } from "surrealdb";
import { assertActionSession, assertWriteActionSession } from "@/actions/auth-actions";
import { assertBudgetInActiveTenant } from "@/lib/budget-tenant";
import { resolveDatabookAreasForProject } from "@/actions/databook-template-actions";
import { seedDeliveryCompositorBlocksAction } from "@/actions/delivery-compositor-block-actions";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { requireActiveTenantId, tenantRecordId } from "@/lib/tenant-query";
import { assertEntityInActiveTenant } from "@/lib/tenant-access";
import { InvalidRecordIdError, recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";
import { deliveryProjectRevalidatePath } from "@/lib/delivery/delivery-path";
import type {
    DeliveryArea,
    DeliveryChecklistItem,
    DeliveryEvidence,
    DeliveryInstallation,
    DeliveryProject,
    DeliveryProjectStatus,
    DeliveryAreaStatus,
    DeliveryEvidenceKind,
} from "@/types/delivery-types";
import type { Budget } from "@/types/budget-types";
import { loadDeliveryProjectExportPayload } from "@/lib/delivery/delivery-project-export-payload";

function serializeProject(row: Record<string, unknown>): DeliveryProject {
    const budget = row.budget_id as Record<string, unknown> | undefined;
    const client = row.client_id as Record<string, unknown> | undefined;
    const databook = row.databook_template_id as Record<string, unknown> | undefined;
    return {
        id: recordIdToString(row.id),
        budget_id: recordIdToString(
            budget?.id ?? row.budget_id,
        ),
        client_id: client?.id
            ? recordIdToString(client.id)
            : row.client_id
              ? recordIdToString(row.client_id)
              : undefined,
        title: String(row.title ?? ""),
        contract_ref: row.contract_ref ? String(row.contract_ref) : undefined,
        status: (row.status as DeliveryProjectStatus) ?? "planning",
        gestor_nome: row.gestor_nome ? String(row.gestor_nome) : undefined,
        gestor_phone: row.gestor_phone ? String(row.gestor_phone) : undefined,
        deadline_days: row.deadline_days != null ? Number(row.deadline_days) : undefined,
        notes: row.notes ? String(row.notes) : undefined,
        budget_code: budget?.code ? String(budget.code) : undefined,
        client_name: client?.name ? String(client.name) : undefined,
        databook_template_id: databook?.id
            ? recordIdToString(databook.id)
            : row.databook_template_id
              ? recordIdToString(row.databook_template_id)
              : undefined,
        databook_template_name: databook?.name
            ? String(databook.name)
            : row.databook_template_name
              ? String(row.databook_template_name)
              : undefined,
        created_at: row.created_at ? String(row.created_at) : undefined,
        updated_at: row.updated_at ? String(row.updated_at) : undefined,
    };
}

function serializeArea(row: Record<string, unknown>): DeliveryArea {
    return {
        id: recordIdToString(row.id),
        delivery_project_id: recordIdToString(row.delivery_project_id),
        code: String(row.code ?? ""),
        title: String(row.title ?? ""),
        description: row.description ? String(row.description) : undefined,
        status: (row.status as DeliveryAreaStatus) ?? "pending",
        sort_order: Number(row.sort_order ?? 0),
        checklist: Array.isArray(row.checklist) ? (row.checklist as DeliveryChecklistItem[]) : [],
    };
}

function serializeEvidence(row: Record<string, unknown>): DeliveryEvidence {
    return {
        id: recordIdToString(row.id),
        delivery_project_id: recordIdToString(row.delivery_project_id),
        delivery_area_id: row.delivery_area_id
            ? recordIdToString(row.delivery_area_id)
            : undefined,
        kind: (row.kind as DeliveryEvidenceKind) ?? "other",
        filename: String(row.filename ?? ""),
        url: String(row.url ?? ""),
        type: String(row.type ?? ""),
        caption: row.caption ? String(row.caption) : undefined,
        created_at: row.created_at ? String(row.created_at) : undefined,
    };
}

function serializeInstallation(
    row: Record<string, unknown>,
    equipment?: Record<string, unknown>,
): DeliveryInstallation {
    return {
        id: recordIdToString(row.id),
        delivery_project_id: recordIdToString(row.delivery_project_id),
        delivery_area_id: recordIdToString(row.delivery_area_id) ?? "",
        technical_equipment_id: recordIdToString(row.technical_equipment_id) ?? "",
        quantity: Number(row.quantity ?? 1),
        tag: row.tag ? String(row.tag) : undefined,
        serial_number: row.serial_number ? String(row.serial_number) : undefined,
        notes: row.notes ? String(row.notes) : undefined,
        include_manual_in_export: row.include_manual_in_export !== false,
        equipment_code: equipment?.code ? String(equipment.code) : undefined,
        equipment_description: equipment?.description ? String(equipment.description) : undefined,
        equipment_manufacturer: equipment?.manufacturer ? String(equipment.manufacturer) : undefined,
        equipment_model: equipment?.model ? String(equipment.model) : undefined,
    };
}

function deliveryRevalidate(projectId: string) {
    revalidatePath("/delivery-projects");
    revalidatePath(deliveryProjectRevalidatePath(projectId));
}

export async function getDeliveryProjectsAction(params?: {
    page?: number;
    limit?: number;
    query?: string;
}) {
    const auth = await assertActionSession();
    if (!auth.ok) {
        return {
            success: false,
            error: auth.error,
            data: [] as DeliveryProject[],
            meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
        };
    }

    const page = params?.page ?? 1;
    const limit = params?.limit ?? 10;
    const start = (page - 1) * limit;
    const search = params?.query?.trim() ?? "";

    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        const sql = `SELECT * FROM delivery_project WHERE tenant_id = $tenantId FETCH budget_id, client_id`;
        const queryParams: Record<string, unknown> = {
            tenantId: tenantRecordId(tenantId),
        };

        const result = await db.query<[Array<Record<string, unknown>>]>(sql, queryParams);
        let all = (result[0] ?? []).map(serializeProject);

        if (search) {
            const lower = search.toLowerCase();
            all = all.filter(
                (p) =>
                    p.title.toLowerCase().includes(lower) ||
                    (p.budget_code?.toLowerCase().includes(lower) ?? false) ||
                    (p.client_name?.toLowerCase().includes(lower) ?? false) ||
                    (p.contract_ref?.toLowerCase().includes(lower) ?? false),
            );
        }

        all.sort((a, b) => {
            const aDate = a.updated_at ?? a.created_at ?? "";
            const bDate = b.updated_at ?? b.created_at ?? "";
            return bDate.localeCompare(aDate);
        });

        const total = all.length;
        return {
            success: true,
            data: all.slice(start, start + limit),
            meta: {
                total,
                page,
                limit,
                totalPages: Math.max(1, Math.ceil(total / limit)),
            },
        };
    } catch (error) {
        console.error("getDeliveryProjectsAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return {
            success: false,
            error: "Erro ao listar projetos",
            data: [],
            meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
        };
    }
}

export async function getDeliveryProjectByBudgetAction(budgetId: string) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const budgetGate = await assertBudgetInActiveTenant(budgetId);
    if (!budgetGate.ok) return { success: false, error: budgetGate.error };

    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        const result = await db.query<[Array<Record<string, unknown>>]>(
            `SELECT * FROM delivery_project WHERE budget_id = $budgetId AND tenant_id = $tenantId LIMIT 1`,
            {
                budgetId: budgetGate.budgetRecordId,
                tenantId: tenantRecordId(tenantId),
            },
        );
        const row = result[0]?.[0];
        if (!row) return { success: true, data: null };
        return { success: true, data: serializeProject(row) };
    } catch {
        return { success: false, error: "Erro ao buscar projeto" };
    }
}

export type DeliveryProjectDetail = {
    project: DeliveryProject;
    areas: DeliveryArea[];
    evidence: DeliveryEvidence[];
    installations: DeliveryInstallation[];
};

export async function getDeliveryProjectDetailAction(projectId: string) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        const pid = requireRecordId("delivery_project", projectId);

        const [projectRes, areasRes, evidenceRes, installationsRes] = await Promise.all([
            db.query<[Array<Record<string, unknown>>]>(
                `SELECT * FROM delivery_project WHERE id = $id AND tenant_id = $tenantId FETCH budget_id, client_id`,
                { id: pid, tenantId: tenantRecordId(tenantId) },
            ),
            db.query<[Array<Record<string, unknown>>]>(
                `SELECT * FROM delivery_area WHERE delivery_project_id = $pid ORDER BY sort_order ASC`,
                { pid },
            ),
            db.query<[Array<Record<string, unknown>>]>(
                `SELECT * FROM delivery_evidence WHERE delivery_project_id = $pid ORDER BY created_at ASC`,
                { pid },
            ),
            db.query<[Array<Record<string, unknown>>]>(
                `SELECT * FROM delivery_installation WHERE delivery_project_id = $pid`,
                { pid },
            ),
        ]);

        const projectRow = projectRes[0]?.[0];
        if (!projectRow) return { success: false, error: "Projeto não encontrado" };

        const equipmentCache = new Map<string, Record<string, unknown>>();
        const installationRows = installationsRes[0] ?? [];
        for (const row of installationRows) {
            const eqId = recordIdToString(row.technical_equipment_id);
            if (!eqId || equipmentCache.has(eqId)) continue;
            try {
                const eqRes = await db.select(requireRecordId("technical_equipment", eqId));
                const eqRow = Array.isArray(eqRes) ? eqRes[0] : eqRes;
                if (eqRow) equipmentCache.set(eqId, eqRow as Record<string, unknown>);
            } catch {
                // equipamento removido ou inválido — ignora vínculo
            }
        }

        const data: DeliveryProjectDetail = {
            project: serializeProject(projectRow),
            areas: (areasRes[0] ?? []).map(serializeArea),
            evidence: (evidenceRes[0] ?? []).map(serializeEvidence),
            installations: installationRows.map((row) => {
                const eqId = recordIdToString(row.technical_equipment_id);
                return serializeInstallation(row, eqId ? equipmentCache.get(eqId) : undefined);
            }),
        };

        return { success: true, data: toPlain(data) };
    } catch (error) {
        console.error("getDeliveryProjectDetailAction:", error);
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        if (isTokenExpiredError(error)) resetDb();
        const message =
            error instanceof Error && error.message.trim()
                ? error.message
                : "Erro ao carregar projeto";
        return { success: false, error: message };
    }
}

export type DeliveryProjectCreationMode = "template" | "blank";

export async function createDeliveryProjectFromBudgetAction(
    budgetId: string,
    options?: {
        mode?: DeliveryProjectCreationMode;
        databookTemplateId?: string;
    },
) {
    const mode = options?.mode ?? "template";
    const databookTemplateId = options?.databookTemplateId;
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const budgetGate = await assertBudgetInActiveTenant(budgetId);
    if (!budgetGate.ok) return { success: false, error: budgetGate.error };

    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();

        const budgetRes = await db.select(budgetGate.budgetRecordId);
        const budget = (Array.isArray(budgetRes) ? budgetRes[0] : budgetRes) as Record<
            string,
            unknown
        >;
        if (!budget) return { success: false, error: "Orçamento não encontrado" };

        if (budget.status !== "approved") {
            return {
                success: false,
                error: "Só é possível abrir projeto de entrega para orçamentos aprovados.",
            };
        }

        const existing = await db.query<[Array<{ id: unknown }>]>(
            `SELECT id FROM delivery_project WHERE budget_id = $budgetId AND tenant_id = $tenantId LIMIT 1`,
            {
                budgetId: budgetGate.budgetRecordId,
                tenantId: tenantRecordId(tenantId),
            },
        );
        if (existing[0]?.length) {
            const existingId = recordIdToString(existing[0][0].id);
            return {
                success: true,
                id: existingId,
                alreadyExists: true,
            };
        }

        const clientId = budget.client_id
            ? requireRecordId("client", recordIdToString(budget.client_id))
            : undefined;

        let resolved: Awaited<ReturnType<typeof resolveDatabookAreasForProject>> = null;
        if (mode === "template") {
            resolved = await resolveDatabookAreasForProject(databookTemplateId);
            if (!resolved) {
                return {
                    success: false,
                    error: "Nenhum DataBook disponível. Cadastre um em DataBooks ou comece do zero.",
                };
            }
        }

        const created = await db.create(new Table("delivery_project")).content({
            tenant_id: tenantRecordId(tenantId),
            budget_id: budgetGate.budgetRecordId,
            client_id: clientId,
            ...(resolved
                ? {
                      databook_template_id: requireRecordId(
                          "databook_template",
                          resolved.templateId,
                      ),
                      databook_template_name: resolved.templateName,
                      deadline_days: resolved.deadlineDays,
                  }
                : {
                      deadline_days: 90,
                  }),
            title: String(budget.title || budget.code || "Projeto de entrega"),
            status: "planning",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });

        const projectRow = Array.isArray(created) ? created[0] : created;
        const projectId = recordIdToString((projectRow as Record<string, unknown>).id);
        const projectRecordId = requireRecordId("delivery_project", projectId);

        if (resolved) {
            const areaTemplates = resolved.areas;
            for (let i = 0; i < areaTemplates.length; i++) {
                const template = areaTemplates[i];
                const checklist: DeliveryChecklistItem[] = template.checklist.map((item) => ({
                    id: crypto.randomUUID(),
                    text: item.text,
                    done: false,
                }));

                await db.create(new Table("delivery_area")).content({
                    tenant_id: tenantRecordId(tenantId),
                    delivery_project_id: projectRecordId,
                    code: template.code,
                    title: template.title,
                    description: template.description ?? "",
                    status: "pending",
                    sort_order: i,
                    checklist,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                });
            }
        }

        await seedDeliveryCompositorBlocksAction(projectId);

        deliveryRevalidate(projectId);
        return { success: true, id: projectId, alreadyExists: false };
    } catch (error) {
        console.error("createDeliveryProjectFromBudgetAction:", error);
        return { success: false, error: "Erro ao criar projeto de entrega" };
    }
}

export async function updateDeliveryProjectAction(
    projectId: string,
    updates: Partial<
        Pick<
            DeliveryProject,
            | "title"
            | "status"
            | "contract_ref"
            | "gestor_nome"
            | "gestor_phone"
            | "deadline_days"
            | "notes"
        >
    >,
) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertEntityInActiveTenant("delivery_project", projectId);
    if (!gate.ok) return { success: false, error: gate.error };

    try {
        const db = await getDb();
        await db.update(requireRecordId("delivery_project", projectId)).merge({
            ...updates,
            updated_at: new Date().toISOString(),
        });
        deliveryRevalidate(projectId);
        return { success: true };
    } catch {
        return { success: false, error: "Erro ao atualizar projeto" };
    }
}

export async function createDeliveryAreaAction(payload: {
    projectId: string;
    code: string;
    title: string;
    description?: string;
    checklist?: string[];
}) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertEntityInActiveTenant("delivery_project", payload.projectId);
    if (!gate.ok) return { success: false, error: gate.error };

    const code = payload.code.trim();
    const title = payload.title.trim();
    if (!code || !title) {
        return { success: false, error: "Informe código e título da área." };
    }

    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        const projectRecordId = requireRecordId("delivery_project", payload.projectId);

        const sortRes = await db.query<[Array<{ sort_order?: number }>]>(
            `SELECT sort_order FROM delivery_area WHERE delivery_project_id = $pid ORDER BY sort_order DESC LIMIT 1`,
            { pid: projectRecordId },
        );
        const nextSort = Number(sortRes[0]?.[0]?.sort_order ?? -1) + 1;

        const checklist: DeliveryChecklistItem[] = (payload.checklist ?? [])
            .map((line) => line.trim())
            .filter(Boolean)
            .map((text) => ({
                id: crypto.randomUUID(),
                text,
                done: false,
            }));

        const created = await db.create(new Table("delivery_area")).content({
            tenant_id: tenantRecordId(tenantId),
            delivery_project_id: projectRecordId,
            code,
            title,
            description: payload.description?.trim() ?? "",
            status: "pending",
            sort_order: nextSort,
            checklist,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });

        const row = Array.isArray(created) ? created[0] : created;
        const areaId = recordIdToString((row as Record<string, unknown>).id);
        deliveryRevalidate(payload.projectId);
        return { success: true, id: areaId };
    } catch {
        return { success: false, error: "Erro ao criar área" };
    }
}

export async function deleteDeliveryAreaAction(areaId: string, projectId: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        const areaRecordId = requireRecordId("delivery_area", areaId);

        const areaRes = await db.select(areaRecordId);
        const area = (Array.isArray(areaRes) ? areaRes[0] : areaRes) as Record<
            string,
            unknown
        >;
        if (!area || !rowBelongsToTenant(area.tenant_id, tenantId)) {
            return { success: false, error: "Área não encontrada" };
        }

        await db.query(
            `DELETE delivery_evidence WHERE delivery_area_id = $aid`,
            { aid: areaRecordId },
        );
        await db.query(
            `DELETE delivery_installation WHERE delivery_area_id = $aid`,
            { aid: areaRecordId },
        );
        await db.delete(areaRecordId);

        deliveryRevalidate(projectId);
        return { success: true };
    } catch {
        return { success: false, error: "Erro ao excluir área" };
    }
}

export async function updateDeliveryAreaAction(
    areaId: string,
    updates: Partial<
        Pick<DeliveryArea, "code" | "title" | "description" | "status" | "checklist">
    >,
) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        const areaRecordId = requireRecordId("delivery_area", areaId);

        const areaRes = await db.select(areaRecordId);
        const area = (Array.isArray(areaRes) ? areaRes[0] : areaRes) as Record<
            string,
            unknown
        >;
        if (!area || !rowBelongsToTenant(area.tenant_id, tenantId)) {
            return { success: false, error: "Área não encontrada" };
        }

        await db.update(areaRecordId).merge({
            ...updates,
            updated_at: new Date().toISOString(),
        });

        const projectId = recordIdToString(area.delivery_project_id);
        if (projectId) deliveryRevalidate(projectId);
        return { success: true };
    } catch {
        return { success: false, error: "Erro ao atualizar área" };
    }
}

function rowBelongsToTenant(rowTenantId: unknown, tenantId: string): boolean {
    const rowTenant = recordIdToString(rowTenantId);
    if (!rowTenant) return true;
    return rowTenant === tenantId;
}

export async function addDeliveryEvidenceAction(payload: {
    projectId: string;
    areaId?: string;
    kind: DeliveryEvidenceKind;
    filename: string;
    url: string;
    type: string;
    caption?: string;
}) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertEntityInActiveTenant("delivery_project", payload.projectId);
    if (!gate.ok) return { success: false, error: gate.error };

    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        const projectRecordId = requireRecordId("delivery_project", payload.projectId);

        await db.create(new Table("delivery_evidence")).content({
            tenant_id: tenantRecordId(tenantId),
            delivery_project_id: projectRecordId,
            delivery_area_id: payload.areaId
                ? requireRecordId("delivery_area", payload.areaId)
                : undefined,
            kind: payload.kind,
            filename: payload.filename,
            url: payload.url,
            type: payload.type,
            caption: payload.caption ?? "",
            created_at: new Date().toISOString(),
        });

        deliveryRevalidate(payload.projectId);
        return { success: true };
    } catch {
        return { success: false, error: "Erro ao registrar evidência" };
    }
}

export async function deleteDeliveryEvidenceAction(evidenceId: string, projectId: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    try {
        const db = await getDb();
        await db.delete(requireRecordId("delivery_evidence", evidenceId));
        deliveryRevalidate(projectId);
        return { success: true };
    } catch {
        return { success: false, error: "Erro ao remover evidência" };
    }
}

export async function addDeliveryInstallationAction(payload: {
    projectId: string;
    areaId: string;
    technicalEquipmentId: string;
    quantity: number;
    tag?: string;
    serialNumber?: string;
    notes?: string;
    includeManualInExport?: boolean;
}) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertEntityInActiveTenant("delivery_project", payload.projectId);
    if (!gate.ok) return { success: false, error: gate.error };

    const eqGate = await assertEntityInActiveTenant(
        "technical_equipment",
        payload.technicalEquipmentId,
    );
    if (!eqGate.ok) return { success: false, error: eqGate.error };

    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();

        await db.create(new Table("delivery_installation")).content({
            tenant_id: tenantRecordId(tenantId),
            delivery_project_id: requireRecordId("delivery_project", payload.projectId),
            delivery_area_id: requireRecordId("delivery_area", payload.areaId),
            technical_equipment_id: requireRecordId(
                "technical_equipment",
                payload.technicalEquipmentId,
            ),
            quantity: Math.max(1, payload.quantity),
            tag: payload.tag ?? "",
            serial_number: payload.serialNumber ?? "",
            notes: payload.notes ?? "",
            include_manual_in_export: payload.includeManualInExport !== false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });

        deliveryRevalidate(payload.projectId);
        return { success: true };
    } catch {
        return { success: false, error: "Erro ao registrar instalação" };
    }
}

export async function deleteDeliveryInstallationAction(installationId: string, projectId: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    try {
        const db = await getDb();
        await db.delete(requireRecordId("delivery_installation", installationId));
        deliveryRevalidate(projectId);
        return { success: true };
    } catch {
        return { success: false, error: "Erro ao remover instalação" };
    }
}

/** Contexto de variáveis ({{orcamento.codigo}}, cliente etc.) no compositor do DataBook. */
export async function getDeliveryCompositorShellAction(projectId: string): Promise<{
    success: boolean;
    data?: Budget;
    error?: string;
}> {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    if (projectId.startsWith("databook:")) {
        const gate = await assertEntityInActiveTenant("databook", projectId);
        if (!gate.ok) return { success: false, error: gate.error };
        const db = await getDb();
        const rows = await db.query<[Array<Record<string, unknown>>]>(
            "SELECT * FROM $id FETCH client_id",
            { id: requireRecordId("databook", projectId) },
        );
        const row = rows[0]?.[0];
        if (!row) return { success: false, error: "DataBook não encontrado" };
        const client = row.client_id as Record<string, unknown> | undefined;
        return {
            success: true,
            data: {
                id: projectId,
                code: String(row.code ?? ""),
                title: String(row.title ?? ""),
                client_id: client?.id ? recordIdToString(client.id) : recordIdToString(row.client_id),
                client_name: client?.name ? String(client.name) : undefined,
                use_compositor: true,
            } as Budget,
        };
    }

    const loaded = await loadDeliveryProjectExportPayload(projectId);
    if (!loaded.ok) return { success: false, error: loaded.error };

    const p = loaded.payload.project;
    return {
        success: true,
        data: {
            id: p.budget_id,
            code: p.budget_code,
            title: p.title,
            client_id: p.client_id,
            client_name: p.client_name,
            use_compositor: true,
        } as Budget,
    };
}

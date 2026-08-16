"use server";

import { revalidatePath } from "next/cache";
import { Table } from "surrealdb";
import { z } from "zod";
import { assertActionSession, assertWriteActionSession } from "@/actions/auth-actions";
import { auditTenantAction } from "@/lib/audit-log";
import { assertEntityInActiveTenant } from "@/lib/tenant-access";
import { requireActiveTenantId, tenantRecordId } from "@/lib/tenant-query";
import { getDb, toPlain } from "@/lib/surreal";
import { recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";
import { getSessionContext } from "@/lib/tenant-context";
import type { Databook } from "@/types/databook-types";

const databookInputSchema = z.object({
    client_id: z.string().min(1, "O cliente é obrigatório para criar um DataBook."),
    template_id: z.string().optional().nullable(),
    code: z.string().trim().min(1, "O código é obrigatório").max(80),
    title: z.string().trim().min(1, "O título é obrigatório").max(300),
    description: z.string().max(5000).optional(),
    project_name: z.string().max(300).optional(),
    worksite_name: z.string().max(300).optional(),
    location: z.string().max(500).optional(),
    art_number: z.string().max(100).optional(),
    revision: z.string().max(50).optional(),
    issue_date: z.string().optional(),
    inspection_date: z.string().optional(),
    validity: z.string().max(100).optional(),
    technical_responsible: z.string().max(300).optional(),
    installer_responsible: z.string().max(300).optional(),
    inspector: z.string().max(300).optional(),
    internal_notes: z.string().max(10000).optional(),
});

export type DatabookInput = z.input<typeof databookInputSchema>;

function serializeDatabook(row: Record<string, unknown>): Databook {
    return {
        id: recordIdToString(row.id),
        client_id: recordIdToString(row.client_id),
        template_id: row.template_id ? recordIdToString(row.template_id) : null,
        code: String(row.code ?? ""),
        title: String(row.title ?? ""),
        description: row.description ? String(row.description) : undefined,
        project_name: row.project_name ? String(row.project_name) : undefined,
        worksite_name: row.worksite_name ? String(row.worksite_name) : undefined,
        location: row.location ? String(row.location) : undefined,
        art_number: row.art_number ? String(row.art_number) : undefined,
        revision: row.revision ? String(row.revision) : undefined,
        issue_date: row.issue_date ? String(row.issue_date) : undefined,
        inspection_date: row.inspection_date ? String(row.inspection_date) : undefined,
        validity: row.validity ? String(row.validity) : undefined,
        technical_responsible: row.technical_responsible ? String(row.technical_responsible) : undefined,
        installer_responsible: row.installer_responsible ? String(row.installer_responsible) : undefined,
        inspector: row.inspector ? String(row.inspector) : undefined,
        internal_notes: row.internal_notes ? String(row.internal_notes) : undefined,
        status: row.status === "in_review" || row.status === "approved" || row.status === "archived" ? row.status : "draft",
        current_version: Number(row.current_version ?? 1),
        pdf_outdated: row.pdf_outdated !== false,
        installation_count: Number(row.installation_count ?? 0),
        created_by: row.created_by ? String(row.created_by) : undefined,
        updated_by: row.updated_by ? String(row.updated_by) : undefined,
        created_at: row.created_at ? String(row.created_at) : undefined,
        updated_at: row.updated_at ? String(row.updated_at) : undefined,
    };
}

function refresh(id?: string) {
    revalidatePath("/dashboard/databook-documents");
    if (id) revalidatePath(`/dashboard/databook-documents/${encodeURIComponent(id)}`);
}

async function validateReferences(input: DatabookInput) {
    const clientGate = await assertEntityInActiveTenant("client", input.client_id);
    if (!clientGate.ok) return clientGate;
    if (input.template_id) {
        const templateGate = await assertEntityInActiveTenant("databook_template", input.template_id);
        if (!templateGate.ok) return templateGate;
    }
    return { ok: true as const };
}

export async function listDatabooksAction(params?: { page?: number; limit?: number; query?: string }) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error, data: [] as Databook[] };
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.max(1, Math.min(100, params?.limit ?? 20));
    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        const result = await db.query<[Array<Record<string, unknown>>]>(
            `SELECT *, count((SELECT id FROM databook_installation WHERE databook_id = $parent.id AND deleted_at IS NONE)) AS installation_count
             FROM databook WHERE tenant_id = $tenantId AND deleted_at IS NONE ORDER BY updated_at DESC`,
            { tenantId: tenantRecordId(tenantId) },
        );
        const query = params?.query?.trim().toLocaleLowerCase("pt-BR");
        const rows = (result[0] ?? []).map(serializeDatabook).filter((item) =>
            !query || `${item.code} ${item.title} ${item.project_name ?? ""} ${item.worksite_name ?? ""}`.toLocaleLowerCase("pt-BR").includes(query),
        );
        return {
            success: true,
            data: toPlain(rows.slice((page - 1) * limit, page * limit)),
            meta: { total: rows.length, page, limit, totalPages: Math.max(1, Math.ceil(rows.length / limit)) },
        };
    } catch (error) {
        console.error("listDatabooksAction:", error);
        return { success: false, error: "Erro ao listar DataBooks", data: [] as Databook[] };
    }
}

export async function getDatabookAction(id: string) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };
    const gate = await assertEntityInActiveTenant("databook", id);
    if (!gate.ok) return { success: false, error: gate.error };
    const db = await getDb();
    const rows = await db.query<[Array<Record<string, unknown>>]>(
        "SELECT * FROM $id WHERE deleted_at IS NONE FETCH client_id, template_id",
        { id: requireRecordId("databook", id) },
    );
    const row = rows[0]?.[0];
    return row ? { success: true, data: toPlain(serializeDatabook(row)) } : { success: false, error: "DataBook não encontrado" };
}

export async function createDatabookAction(raw: DatabookInput) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };
    const parsed = databookInputSchema.safeParse(raw);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
    const refs = await validateReferences(parsed.data);
    if (!refs.ok) return { success: false, error: refs.error };
    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        const actorEmail = (await getSessionContext())?.email ?? "system";
        const now = new Date().toISOString();
        const created = await db.create(new Table("databook")).content({
            ...parsed.data,
            client_id: requireRecordId("client", parsed.data.client_id),
            template_id: parsed.data.template_id ? requireRecordId("databook_template", parsed.data.template_id) : null,
            tenant_id: tenantRecordId(tenantId),
            status: "draft",
            settings: {},
            current_version: 1,
            pdf_outdated: true,
            created_by: actorEmail,
            updated_by: actorEmail,
            created_at: now,
            updated_at: now,
        });
        const row = (Array.isArray(created) ? created[0] : created) as Record<string, unknown>;
        const id = recordIdToString(row.id);
        await auditTenantAction({ action: "databook.create", resourceType: "databook", resourceId: id, summary: `DataBook ${parsed.data.code} criado` });
        refresh(id);
        return { success: true, id };
    } catch (error) {
        console.error("createDatabookAction:", error);
        return { success: false, error: "Erro ao criar DataBook" };
    }
}

export async function updateDatabookAction(id: string, raw: DatabookInput) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };
    const gate = await assertEntityInActiveTenant("databook", id);
    if (!gate.ok) return { success: false, error: gate.error };
    const parsed = databookInputSchema.safeParse(raw);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
    const refs = await validateReferences(parsed.data);
    if (!refs.ok) return { success: false, error: refs.error };
    try {
        const db = await getDb();
        const actorEmail = (await getSessionContext())?.email ?? "system";
        const currentRows = await db.query<[Array<{ current_version?: number }>]>(
            "SELECT current_version FROM $id LIMIT 1",
            { id: requireRecordId("databook", id) },
        );
        await db.update(requireRecordId("databook", id)).merge({
            ...parsed.data,
            client_id: requireRecordId("client", parsed.data.client_id),
            template_id: parsed.data.template_id ? requireRecordId("databook_template", parsed.data.template_id) : null,
            current_version: Number(currentRows[0]?.[0]?.current_version ?? 1) + 1,
            pdf_outdated: true,
            updated_by: actorEmail,
            updated_at: new Date().toISOString(),
        });
        await auditTenantAction({ action: "databook.update", resourceType: "databook", resourceId: id, summary: `DataBook ${parsed.data.code} atualizado` });
        refresh(id);
        return { success: true };
    } catch (error) {
        console.error("updateDatabookAction:", error);
        return { success: false, error: "Erro ao atualizar DataBook" };
    }
}

export async function deleteDatabookAction(id: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };
    const gate = await assertEntityInActiveTenant("databook", id);
    if (!gate.ok) return { success: false, error: gate.error };
    try {
        const db = await getDb();
        const actorEmail = (await getSessionContext())?.email ?? "system";
        await db.update(requireRecordId("databook", id)).merge({
            deleted_at: new Date().toISOString(),
            updated_by: actorEmail,
            updated_at: new Date().toISOString(),
        });
        await auditTenantAction({ action: "databook.delete", resourceType: "databook", resourceId: id, summary: "DataBook excluído" });
        refresh();
        return { success: true };
    } catch (error) {
        console.error("deleteDatabookAction:", error);
        return { success: false, error: "Erro ao excluir DataBook" };
    }
}

export async function duplicateDatabookAction(id: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };
    const gate = await assertEntityInActiveTenant("databook", id);
    if (!gate.ok) return { success: false, error: gate.error };
    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        const actorEmail = (await getSessionContext())?.email ?? "system";
        const sourceRows = await db.query<[Array<Record<string, unknown>>]>(
            "SELECT * FROM $id LIMIT 1",
            { id: requireRecordId("databook", id) },
        );
        const source = sourceRows[0]?.[0];
        if (!source) return { success: false, error: "DataBook não encontrado" };
        const now = new Date().toISOString();
        const created = await db.create(new Table("databook")).content({
            tenant_id: tenantRecordId(tenantId),
            client_id: source.client_id,
            template_id: source.template_id ?? null,
            code: `${String(source.code ?? "DATABOOK")}-COPIA`,
            title: `${String(source.title ?? "DataBook")} — Cópia`,
            description: source.description ?? "",
            project_name: source.project_name ?? "",
            worksite_name: source.worksite_name ?? "",
            location: source.location ?? "",
            art_number: source.art_number ?? "",
            revision: source.revision ?? "",
            issue_date: source.issue_date ?? null,
            inspection_date: source.inspection_date ?? null,
            validity: source.validity ?? "",
            technical_responsible: source.technical_responsible ?? "",
            installer_responsible: source.installer_responsible ?? "",
            inspector: source.inspector ?? "",
            internal_notes: source.internal_notes ?? "",
            settings: structuredClone(source.settings ?? {}),
            status: "draft",
            current_version: 1,
            pdf_outdated: true,
            created_by: actorEmail,
            updated_by: actorEmail,
            created_at: now,
            updated_at: now,
        });
        const targetId = recordIdToString(((Array.isArray(created) ? created[0] : created) as Record<string, unknown>).id);
        const targetRecord = requireRecordId("databook", targetId);

        const installationRows = await db.query<[Array<Record<string, unknown>>]>(
            "SELECT * FROM databook_installation WHERE databook_id = $source AND deleted_at IS NONE ORDER BY position ASC",
            { source: requireRecordId("databook", id) },
        );
        const installationMap = new Map<string, string>();
        const productMap = new Map<string, string>();
        for (const installation of installationRows[0] ?? []) {
            const oldInstallationId = recordIdToString(installation.id);
            const copy = { ...installation };
            delete copy.id;
            const newInstallation = await db.create(new Table("databook_installation")).content({
                ...copy,
                databook_id: targetRecord,
                created_at: now,
                updated_at: now,
            });
            const newInstallationId = recordIdToString(((Array.isArray(newInstallation) ? newInstallation[0] : newInstallation) as Record<string, unknown>).id);
            installationMap.set(oldInstallationId, newInstallationId);
            const productRows = await db.query<[Array<Record<string, unknown>>]>(
                "SELECT * FROM databook_installation_product WHERE databook_installation_id = $installation AND deleted_at IS NONE ORDER BY position ASC",
                { installation: requireRecordId("databook_installation", oldInstallationId) },
            );
            for (const product of productRows[0] ?? []) {
                const oldProductId = recordIdToString(product.id);
                const productCopy = { ...product };
                delete productCopy.id;
                const newProduct = await db.create(new Table("databook_installation_product")).content({
                    ...productCopy,
                    databook_installation_id: requireRecordId("databook_installation", newInstallationId),
                    created_at: now,
                    updated_at: now,
                });
                productMap.set(oldProductId, recordIdToString(((Array.isArray(newProduct) ? newProduct[0] : newProduct) as Record<string, unknown>).id));
            }
        }

        const mediaRows = await db.query<[Array<Record<string, unknown>>]>(
            "SELECT * FROM databook_media WHERE databook_id = $source AND deleted_at IS NONE ORDER BY position ASC",
            { source: requireRecordId("databook", id) },
        );
        for (const media of mediaRows[0] ?? []) {
            const copy = { ...media };
            delete copy.id;
            await db.create(new Table("databook_media")).content({
                ...copy,
                databook_id: targetRecord,
                installation_id: media.installation_id
                    ? requireRecordId("databook_installation", installationMap.get(recordIdToString(media.installation_id))!)
                    : null,
                installation_product_id: media.installation_product_id
                    ? requireRecordId("databook_installation_product", productMap.get(recordIdToString(media.installation_product_id))!)
                    : null,
                created_at: now,
                updated_at: now,
            });
        }

        const blockRows = await db.query<[Array<Record<string, unknown>>]>(
            "SELECT * FROM delivery_block WHERE delivery_project_id = $source AND deleted_at IS NONE ORDER BY order_index ASC",
            { source: requireRecordId("databook", id) },
        );
        const blockMap = new Map<string, string>();
        const pendingBlocks = [...(blockRows[0] ?? [])];
        while (pendingBlocks.length) {
            const index = pendingBlocks.findIndex((block) => !block.parent_id || blockMap.has(recordIdToString(block.parent_id)));
            if (index < 0) break;
            const [block] = pendingBlocks.splice(index, 1);
            const oldBlockId = recordIdToString(block.id);
            const copy = { ...block };
            delete copy.id;
            delete copy.parent_id;
            const parentId = block.parent_id ? blockMap.get(recordIdToString(block.parent_id)) : null;
            const newBlock = await db.create(new Table("delivery_block")).content({
                ...copy,
                delivery_project_id: targetRecord,
                ...(parentId ? { parent_id: requireRecordId("delivery_block", parentId) } : {}),
            });
            blockMap.set(oldBlockId, recordIdToString(((Array.isArray(newBlock) ? newBlock[0] : newBlock) as Record<string, unknown>).id));
        }

        await auditTenantAction({
            action: "databook.duplicate",
            resourceType: "databook",
            resourceId: targetId,
            summary: `DataBook ${String(source.code ?? "")} duplicado`,
            metadata: { sourceId: id },
        });
        refresh(targetId);
        return { success: true, id: targetId };
    } catch (error) {
        console.error("duplicateDatabookAction:", error);
        return { success: false, error: "Erro ao duplicar DataBook" };
    }
}

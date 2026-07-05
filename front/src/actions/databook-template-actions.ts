"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Table } from "surrealdb";
import { assertActionSession, assertWriteActionSession } from "@/actions/auth-actions";
import { BUILTIN_DATABOOK_CVALE_SEED } from "@/lib/delivery/built-in-databook-cvale";
import {
    buildBuiltinMemorialReferenceFile,
    resolveBuiltinMemorialPdfPath,
} from "@/lib/delivery/databook-memorial-seed";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { requireActiveTenantId, tenantRecordId } from "@/lib/tenant-query";
import { assertEntityInActiveTenant } from "@/lib/tenant-access";
import { InvalidRecordIdError, recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";
import type {
    DatabookTemplate,
    DatabookTemplateArea,
    DatabookTemplateFile,
} from "@/types/databook-template-types";

const TABLE_NAME = "databook_template";

const areaSchema = z.object({
    code: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    checklist: z.array(z.object({ text: z.string().min(1) })),
});

const templateSchema = z.object({
    name: z.string().min(1, "O nome é obrigatório"),
    description: z.string().optional(),
    client_label: z.string().optional(),
    default_deadline_days: z.number().int().min(1).max(365).default(90),
    areas: z.array(areaSchema).min(1, "Inclua ao menos uma área"),
    reference_file: z
        .object({
            id: z.string(),
            filename: z.string(),
            url: z.string(),
            type: z.string(),
        })
        .nullable()
        .optional(),
    is_default: z.boolean().default(false),
    active: z.boolean().default(true),
});

function serializeFile(raw: unknown): DatabookTemplateFile | null {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    if (!o.url) return null;
    return {
        id: String(o.id ?? crypto.randomUUID()),
        filename: String(o.filename ?? "arquivo"),
        url: String(o.url),
        type: String(o.type ?? "application/octet-stream"),
    };
}

function serializeTemplate(row: Record<string, unknown>): DatabookTemplate {
    const areas = Array.isArray(row.areas) ? (row.areas as DatabookTemplateArea[]) : [];
    return {
        id: recordIdToString(row.id),
        name: String(row.name ?? ""),
        description: row.description ? String(row.description) : undefined,
        client_label: row.client_label ? String(row.client_label) : undefined,
        default_deadline_days:
            row.default_deadline_days != null ? Number(row.default_deadline_days) : 90,
        areas,
        reference_file: serializeFile(row.reference_file),
        is_default: Boolean(row.is_default),
        active: row.active !== false,
        created_at: row.created_at ? String(row.created_at) : undefined,
        updated_at: row.updated_at ? String(row.updated_at) : undefined,
    };
}

function revalidateDatabooks(id?: string) {
    revalidatePath("/dashboard/databooks");
    if (id) revalidatePath(`/dashboard/databooks/${id}`);
}

async function attachMemorialReferenceToTemplate(
    templateId: string,
    db: Awaited<ReturnType<typeof getDb>>,
): Promise<DatabookTemplateFile | null> {
    const referenceFile = await buildBuiltinMemorialReferenceFile(templateId);
    if (!referenceFile) return null;

    await db.update(requireRecordId(TABLE_NAME, templateId)).merge({
        reference_file: referenceFile,
        updated_at: new Date().toISOString(),
    });
    return referenceFile;
}

/** Anexa memorial do repositório (`laudos tecnicos.pdf`) ao DataBook padrão sem referência. */
async function ensureDefaultDatabookMemorialBackfill(
    db: Awaited<ReturnType<typeof getDb>>,
    tenantId: string,
): Promise<void> {
    if (!resolveBuiltinMemorialPdfPath()) return;

    const rows = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT id, reference_file, is_default FROM ${TABLE_NAME}
         WHERE tenant_id = $tenantId AND is_default = true LIMIT 1`,
        { tenantId: tenantRecordId(tenantId) },
    );
    const row = rows[0]?.[0];
    if (!row) return;

    const existing = serializeFile(row.reference_file);
    if (existing?.url) return;

    const templateId = recordIdToString(row.id);
    if (!templateId) return;

    try {
        await attachMemorialReferenceToTemplate(templateId, db);
        revalidateDatabooks(templateId);
    } catch (e) {
        console.warn("ensureDefaultDatabookMemorialBackfill:", e);
    }
}

/** Garante que o tenant tenha ao menos o DataBook padrão C.Vale. */
export async function ensureDefaultDatabookTemplateAction(): Promise<void> {
    const auth = await assertActionSession();
    if (!auth.ok) return;

    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        const existing = await db.query<[Array<{ id: unknown }>]>(
            `SELECT id FROM ${TABLE_NAME} WHERE tenant_id = $tenantId LIMIT 1`,
            { tenantId: tenantRecordId(tenantId) },
        );
        if (existing[0]?.length) {
            await ensureDefaultDatabookMemorialBackfill(db, tenantId);
            return;
        }

        const created = await db.create(new Table(TABLE_NAME)).content({
            tenant_id: tenantRecordId(tenantId),
            name: BUILTIN_DATABOOK_CVALE_SEED.name,
            description: BUILTIN_DATABOOK_CVALE_SEED.description,
            client_label: BUILTIN_DATABOOK_CVALE_SEED.client_label,
            default_deadline_days: BUILTIN_DATABOOK_CVALE_SEED.default_deadline_days,
            areas: BUILTIN_DATABOOK_CVALE_SEED.areas,
            is_default: true,
            active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });

        const row = Array.isArray(created) ? created[0] : created;
        const templateId = recordIdToString((row as Record<string, unknown>).id);
        if (templateId) {
            await attachMemorialReferenceToTemplate(templateId, db);
        }
    } catch (e) {
        console.warn("ensureDefaultDatabookTemplateAction:", e);
    }
}

/** Importa `laudos tecnicos.pdf` do repositório como memorial de referência do DataBook. */
export async function importBuiltinMemorialToDatabookAction(templateId: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertEntityInActiveTenant(TABLE_NAME, templateId);
    if (!gate.ok) return { success: false, error: gate.error };

    if (!resolveBuiltinMemorialPdfPath()) {
        return {
            success: false,
            error:
                "Arquivo laudos tecnicos.pdf não encontrado na raiz do projeto.",
        };
    }

    try {
        const db = await getDb();
        const referenceFile = await attachMemorialReferenceToTemplate(templateId, db);
        if (!referenceFile) {
            return { success: false, error: "Não foi possível copiar o memorial." };
        }
        revalidateDatabooks(templateId);
        return { success: true, data: referenceFile };
    } catch (e) {
        console.error("importBuiltinMemorialToDatabookAction:", e);
        return { success: false, error: "Erro ao importar memorial" };
    }
}

export async function getDatabookTemplatesAction(params?: {
    page?: number;
    limit?: number;
    query?: string;
    activeOnly?: boolean;
}) {
    const auth = await assertActionSession();
    if (!auth.ok) {
        return {
            success: false,
            error: auth.error,
            data: [] as DatabookTemplate[],
            meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
        };
    }

    await ensureDefaultDatabookTemplateAction();

    const page = params?.page ?? 1;
    const limit = params?.limit ?? 20;
    const start = (page - 1) * limit;
    const search = params?.query?.trim() ?? "";

    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        const result = await db.query<[Array<Record<string, unknown>>]>(
            `SELECT * FROM ${TABLE_NAME} WHERE tenant_id = $tenantId`,
            { tenantId: tenantRecordId(tenantId) },
        );

        let all = (result[0] ?? []).map(serializeTemplate);
        if (params?.activeOnly !== false) {
            all = all.filter((t) => t.active);
        }
        if (search) {
            const lower = search.toLowerCase();
            all = all.filter(
                (t) =>
                    t.name.toLowerCase().includes(lower) ||
                    (t.client_label?.toLowerCase().includes(lower) ?? false) ||
                    (t.description?.toLowerCase().includes(lower) ?? false),
            );
        }

        all.sort((a, b) => {
            if (a.is_default && !b.is_default) return -1;
            if (!a.is_default && b.is_default) return 1;
            return a.name.localeCompare(b.name, "pt-BR");
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
        console.error("getDatabookTemplatesAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return {
            success: false,
            error: "Erro ao listar DataBooks",
            data: [],
            meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
        };
    }
}

export async function getDatabookTemplateAction(id: string) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertEntityInActiveTenant(TABLE_NAME, id);
    if (!gate.ok) return { success: false, error: gate.error };

    try {
        const db = await getDb();
        const row = await db.select(requireRecordId(TABLE_NAME, id));
        const data = Array.isArray(row) ? row[0] : row;
        if (!data) return { success: false, error: "DataBook não encontrado" };
        return {
            success: true,
            data: serializeTemplate(data as Record<string, unknown>),
        };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        return { success: false, error: "DataBook não encontrado" };
    }
}

export async function getDefaultDatabookTemplateAction() {
    await ensureDefaultDatabookTemplateAction();
    const list = await getDatabookTemplatesAction({ limit: 100, page: 1 });
    const templates = list.data ?? [];
    const def = templates.find((t) => t.is_default) ?? templates[0];
    return def ?? null;
}

export async function listDatabookTemplatesForSelectAction() {
    const res = await getDatabookTemplatesAction({ limit: 100, page: 1, activeOnly: true });
    return res.data ?? [];
}

function parseFormTemplate(formData: FormData) {
    const areasRaw = formData.get("areas") as string;
    let areas: DatabookTemplateArea[] = [];
    if (areasRaw) {
        try {
            areas = JSON.parse(areasRaw);
        } catch {
            areas = [];
        }
    }

    const refRaw = formData.get("reference_file") as string;
    let reference_file = null;
    if (refRaw) {
        try {
            reference_file = JSON.parse(refRaw);
        } catch {
            reference_file = null;
        }
    }

    return {
        name: (formData.get("name") as string)?.trim(),
        description: (formData.get("description") as string) || undefined,
        client_label: (formData.get("client_label") as string) || undefined,
        default_deadline_days: Number(formData.get("default_deadline_days")) || 90,
        areas,
        reference_file,
        is_default: formData.get("is_default") === "true",
        active: formData.get("active") !== "false",
    };
}

async function clearOtherDefaults(db: Awaited<ReturnType<typeof getDb>>, tenantId: string, exceptId?: string) {
    const rows = await db.query<[Array<{ id: unknown }>]>(
        `SELECT id FROM ${TABLE_NAME} WHERE tenant_id = $tenantId AND is_default = true`,
        { tenantId: tenantRecordId(tenantId) },
    );
    for (const row of rows[0] ?? []) {
        const id = recordIdToString(row.id);
        if (!id || id === exceptId) continue;
        await db.update(requireRecordId(TABLE_NAME, id)).merge({ is_default: false });
    }
}

export async function createDatabookTemplateAction(formData: FormData) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const raw = parseFormTemplate(formData);
    const validated = templateSchema.safeParse(raw);
    if (!validated.success) {
        return {
            success: false,
            error: validated.error.flatten().fieldErrors.areas?.[0] ?? "Erro de validação",
            fieldErrors: validated.error.flatten().fieldErrors,
        };
    }

    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        const data = validated.data;
        let isDefault = data.is_default;

        if (isDefault) {
            await clearOtherDefaults(db, tenantId);
        } else {
            const any = await db.query<[Array<{ id: unknown }>]>(
                `SELECT id FROM ${TABLE_NAME} WHERE tenant_id = $tenantId LIMIT 1`,
                { tenantId: tenantRecordId(tenantId) },
            );
            if (!any[0]?.length) isDefault = true;
        }

        const created = await db.create(new Table(TABLE_NAME)).content({
            ...data,
            is_default: isDefault,
            tenant_id: tenantRecordId(tenantId),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });

        const row = Array.isArray(created) ? created[0] : created;
        const id = recordIdToString((row as Record<string, unknown>).id);
        revalidateDatabooks(id);
        return { success: true, id };
    } catch (error) {
        console.error("createDatabookTemplateAction:", error);
        return { success: false, error: "Erro ao criar DataBook" };
    }
}

export async function updateDatabookTemplateAction(id: string, formData: FormData) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertEntityInActiveTenant(TABLE_NAME, id);
    if (!gate.ok) return { success: false, error: gate.error };

    const raw = parseFormTemplate(formData);
    const validated = templateSchema.safeParse(raw);
    if (!validated.success) {
        return {
            success: false,
            error: "Erro de validação",
            fieldErrors: validated.error.flatten().fieldErrors,
        };
    }

    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        const data = validated.data;

        if (data.is_default) {
            await clearOtherDefaults(db, tenantId, id);
        }

        await db.update(requireRecordId(TABLE_NAME, id)).merge({
            ...data,
            updated_at: new Date().toISOString(),
        });

        revalidateDatabooks(id);
        return { success: true };
    } catch (error) {
        console.error("updateDatabookTemplateAction:", error);
        return { success: false, error: "Erro ao atualizar DataBook" };
    }
}

export async function duplicateDatabookTemplateAction(id: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const res = await getDatabookTemplateAction(id);
    if (!res.success || !res.data) return { success: false, error: res.error };

    const source = res.data;
    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        const created = await db.create(new Table(TABLE_NAME)).content({
            tenant_id: tenantRecordId(tenantId),
            name: `${source.name} (cópia)`,
            description: source.description ?? "",
            client_label: source.client_label ?? "",
            default_deadline_days: source.default_deadline_days ?? 90,
            areas: JSON.parse(JSON.stringify(source.areas)),
            reference_file: source.reference_file ?? null,
            is_default: false,
            active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
        const row = Array.isArray(created) ? created[0] : created;
        const newId = recordIdToString((row as Record<string, unknown>).id);
        revalidateDatabooks(newId);
        return { success: true, id: newId };
    } catch {
        return { success: false, error: "Erro ao duplicar DataBook" };
    }
}

export async function deleteDatabookTemplateAction(id: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertEntityInActiveTenant(TABLE_NAME, id);
    if (!gate.ok) return { success: false, error: gate.error };

    const res = await getDatabookTemplateAction(id);
    if (res.data?.is_default) {
        return {
            success: false,
            error: "Não é possível excluir o DataBook padrão. Defina outro como padrão antes.",
        };
    }

    try {
        const db = await getDb();
        const inUse = await db.query<[Array<{ id: unknown }>]>(
            `SELECT id FROM delivery_project WHERE databook_template_id = $tid LIMIT 1`,
            { tid: requireRecordId(TABLE_NAME, id) },
        );
        if (inUse[0]?.length) {
            return {
                success: false,
                error: "Este DataBook está em uso em projetos de entrega e não pode ser excluído.",
            };
        }

        await db.delete(requireRecordId(TABLE_NAME, id));
        revalidateDatabooks();
        return { success: true };
    } catch {
        return { success: false, error: "Erro ao excluir DataBook" };
    }
}

export async function resolveDatabookAreasForProject(
    databookTemplateId?: string | null,
): Promise<{
    areas: DatabookTemplateArea[];
    templateId: string;
    templateName: string;
    deadlineDays: number;
} | null> {
    await ensureDefaultDatabookTemplateAction();

    let template: DatabookTemplate | null = null;

    if (databookTemplateId) {
        const res = await getDatabookTemplateAction(databookTemplateId);
        if (res.success && res.data) template = res.data;
    }

    if (!template) {
        const def = await getDefaultDatabookTemplateAction();
        if (!def) return null;
        template = def;
    }

    if (!template.id || !template.areas.length) return null;

    return {
        areas: template.areas,
        templateId: template.id,
        templateName: template.name,
        deadlineDays: template.default_deadline_days ?? 90,
    };
}

"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Table } from "surrealdb";
import { assertActionSession, assertWriteActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { requireActiveTenantId, tenantRecordId } from "@/lib/tenant-query";
import { assertEntityInActiveTenant } from "@/lib/tenant-access";
import { InvalidRecordIdError, recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";
import type {
    TechnicalEquipment,
    TechnicalEquipmentCategory,
    TechnicalEquipmentFile,
} from "@/types/technical-equipment-types";

const TABLE_NAME = "technical_equipment";

const fileSchema = z
    .object({
        id: z.string(),
        filename: z.string(),
        url: z.string(),
        type: z.string(),
    })
    .nullable()
    .optional();

const equipmentSchema = z.object({
    code: z.string().min(1, "O código é obrigatório"),
    manufacturer: z.string().min(1, "O fabricante é obrigatório"),
    model: z.string().min(1, "O modelo é obrigatório"),
    description: z.string().min(1, "A descrição é obrigatória"),
    category: z.enum([
        "linha_vida",
        "trava_quedas",
        "conector",
        "guarda_corpo",
        "escada",
        "monope",
        "plataforma",
        "outro",
    ]),
    norms: z.array(z.string()).optional(),
    capacity_kn: z.number().nullable().optional(),
    users_capacity: z.number().int().nullable().optional(),
    imageUrl: z.string().optional(),
    manual_file: fileSchema,
    datasheet_file: fileSchema,
    certificate_file: fileSchema,
    notes: z.string().optional(),
    active: z.boolean().default(true),
});

function serializeFile(raw: unknown): TechnicalEquipmentFile | null {
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

function serializeEquipment(row: Record<string, unknown>): TechnicalEquipment {
    const safeId = (id: unknown) => {
        if (id == null) return undefined;
        return recordIdToString(id) || String(id);
    };

    return {
        id: safeId(row.id),
        code: String(row.code ?? ""),
        manufacturer: String(row.manufacturer ?? ""),
        model: String(row.model ?? ""),
        description: String(row.description ?? ""),
        category: (row.category as TechnicalEquipmentCategory) || "outro",
        norms: Array.isArray(row.norms) ? row.norms.map(String) : [],
        capacity_kn: row.capacity_kn != null ? Number(row.capacity_kn) : null,
        users_capacity: row.users_capacity != null ? Number(row.users_capacity) : null,
        imageUrl: row.imageUrl ? String(row.imageUrl) : undefined,
        manual_file: serializeFile(row.manual_file),
        datasheet_file: serializeFile(row.datasheet_file),
        certificate_file: serializeFile(row.certificate_file),
        notes: row.notes ? String(row.notes) : undefined,
        active: row.active !== false,
        created_at: row.created_at ? String(row.created_at) : undefined,
        updated_at: row.updated_at ? String(row.updated_at) : undefined,
    };
}

export async function getTechnicalEquipmentsAction(params?: {
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
            data: [] as TechnicalEquipment[],
            meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
        };
    }

    const page = params?.page || 1;
    const limit = params?.limit || 10;
    const start = (page - 1) * limit;
    const search = params?.query?.trim() || "";

    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        let sql = `SELECT * FROM ${TABLE_NAME} WHERE tenant_id = $tenantId`;
        const queryParams: Record<string, unknown> = {
            tenantId: tenantRecordId(tenantId),
        };

        if (params?.activeOnly !== false) {
            sql += ` AND (active IS NONE OR active = true)`;
        }

        if (search) {
            sql += ` AND (
                string::lowercase(code) CONTAINS string::lowercase($search)
                OR string::lowercase(description) CONTAINS string::lowercase($search)
                OR string::lowercase(manufacturer) CONTAINS string::lowercase($search)
                OR string::lowercase(model) CONTAINS string::lowercase($search)
            )`;
            queryParams.search = search;
        }

        const result = await db.query<[Array<Record<string, unknown>>]>(sql, queryParams);
        const all = (result[0] || []).map(serializeEquipment);
        const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
        all.sort((a, b) => collator.compare(a.code, b.code));

        const total = all.length;
        const data = all.slice(start, start + limit);

        return {
            success: true,
            data,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.max(1, Math.ceil(total / limit)),
            },
        };
    } catch (error) {
        console.error("getTechnicalEquipmentsAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return {
            success: false,
            error: "Erro ao listar equipamentos",
            data: [],
            meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
        };
    }
}

export async function getTechnicalEquipmentAction(id: string) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    try {
        const gate = await assertEntityInActiveTenant(TABLE_NAME, id);
        if (!gate.ok) return { success: false, error: gate.error };

        const db = await getDb();
        const recordId = requireRecordId(TABLE_NAME, id);
        const result = await db.select(recordId);
        const row = Array.isArray(result) ? result[0] : result;
        if (!row) return { success: false, error: "Equipamento não encontrado" };

        return {
            success: true,
            data: serializeEquipment(row as Record<string, unknown>),
        };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        return { success: false, error: "Equipamento não encontrado" };
    }
}

export async function getNextTechnicalEquipmentCodeAction() {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error, data: "EQ-0001" };

    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        const result = await db.query<[Array<{ code: string }>]>(
            `SELECT code FROM ${TABLE_NAME} WHERE tenant_id = $tenantId`,
            { tenantId: tenantRecordId(tenantId) },
        );
        let maxNum = 0;
        for (const row of result[0] ?? []) {
            const match = row.code.match(/(\d+)\s*$/);
            if (match) {
                const num = parseInt(match[1], 10);
                if (!Number.isNaN(num) && num > maxNum) maxNum = num;
            }
        }
        const next = `EQ-${String(maxNum + 1).padStart(4, "0")}`;
        return { success: true, data: next };
    } catch {
        return { success: true, data: "EQ-0001" };
    }
}

function parseFormEquipment(formData: FormData) {
    const normsRaw = formData.get("norms") as string;
    let norms: string[] = [];
    if (normsRaw) {
        try {
            norms = JSON.parse(normsRaw);
        } catch {
            norms = normsRaw
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
        }
    }

    const parseFile = (key: string) => {
        const raw = formData.get(key) as string;
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    };

    return {
        code: (formData.get("code") as string)?.trim(),
        manufacturer: (formData.get("manufacturer") as string)?.trim(),
        model: (formData.get("model") as string)?.trim(),
        description: (formData.get("description") as string)?.trim(),
        category: (formData.get("category") as string) || "outro",
        norms,
        capacity_kn: formData.get("capacity_kn")
            ? Number(formData.get("capacity_kn"))
            : null,
        users_capacity: formData.get("users_capacity")
            ? Number(formData.get("users_capacity"))
            : null,
        imageUrl: (formData.get("imageUrl") as string) || undefined,
        manual_file: parseFile("manual_file"),
        datasheet_file: parseFile("datasheet_file"),
        certificate_file: parseFile("certificate_file"),
        notes: (formData.get("notes") as string) || undefined,
        active: formData.get("active") !== "false",
    };
}

export async function createTechnicalEquipmentAction(formData: FormData) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const raw = parseFormEquipment(formData);
    const validated = equipmentSchema.safeParse(raw);
    if (!validated.success) {
        return {
            success: false,
            error: "Erro de validação",
            fieldErrors: validated.error.flatten().fieldErrors,
        };
    }

    const data = validated.data;

    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        const dup = await db.query<[Array<{ id: unknown }>]>(
            `SELECT id FROM ${TABLE_NAME} WHERE tenant_id = $tenantId AND code = $code LIMIT 1`,
            { tenantId: tenantRecordId(tenantId), code: data.code },
        );
        if (dup[0]?.length) {
            return { success: false, error: "Já existe um equipamento com este código" };
        }

        const created = await db.create(new Table(TABLE_NAME)).content({
            ...data,
            tenant_id: tenantRecordId(tenantId),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });

        const row = Array.isArray(created) ? created[0] : created;
        const id = recordIdToString((row as Record<string, unknown>)?.id);

        revalidatePath("/dashboard/technical-equipment");
        return { success: true, id };
    } catch (error) {
        console.error("createTechnicalEquipmentAction:", error);
        return { success: false, error: "Erro ao criar equipamento" };
    }
}

export async function updateTechnicalEquipmentAction(id: string, formData: FormData) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertEntityInActiveTenant(TABLE_NAME, id);
    if (!gate.ok) return { success: false, error: gate.error };

    const raw = parseFormEquipment(formData);
    const validated = equipmentSchema.safeParse(raw);
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
        const recordId = requireRecordId(TABLE_NAME, id);

        const dup = await db.query<[Array<{ id: unknown }>]>(
            `SELECT id FROM ${TABLE_NAME} WHERE tenant_id = $tenantId AND code = $code AND id != $id LIMIT 1`,
            {
                tenantId: tenantRecordId(tenantId),
                code: validated.data.code,
                id: recordId,
            },
        );
        if (dup[0]?.length) {
            return { success: false, error: "Já existe um equipamento com este código" };
        }

        await db.update(recordId).merge({
            ...validated.data,
            updated_at: new Date().toISOString(),
        });

        revalidatePath("/dashboard/technical-equipment");
        revalidatePath(`/dashboard/technical-equipment/${id}`);
        return { success: true };
    } catch (error) {
        console.error("updateTechnicalEquipmentAction:", error);
        return { success: false, error: "Erro ao atualizar equipamento" };
    }
}

export async function deleteTechnicalEquipmentAction(id: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertEntityInActiveTenant(TABLE_NAME, id);
    if (!gate.ok) return { success: false, error: gate.error };

    try {
        const db = await getDb();
        await db.delete(requireRecordId(TABLE_NAME, id));
        revalidatePath("/dashboard/technical-equipment");
        return { success: true };
    } catch {
        return { success: false, error: "Erro ao excluir equipamento" };
    }
}

export async function listTechnicalEquipmentsForSelectAction() {
    const res = await getTechnicalEquipmentsAction({ limit: 500, page: 1, activeOnly: true });
    return res.data ?? [];
}

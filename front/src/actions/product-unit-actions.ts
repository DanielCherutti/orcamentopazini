"use server";

import { Table } from "surrealdb";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertWriteActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { requireActiveTenantId, tenantRecordId } from "@/lib/tenant-query";
import { assertEntityInActiveTenant } from "@/lib/tenant-access";
import { auditTenantAction } from "@/lib/audit-log";

export type ProductUnit = {
  id: string;
  company_id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

const TABLE_NAME = "product_unit";
const DEFAULT_COMPANY_ID = 0;

const createUnitSchema = z.object({
  name: z.string().min(1, "O nome da unidade é obrigatório").trim(),
});

function serializeUnit(raw: Record<string, unknown>): ProductUnit {
  const safeId = (id: unknown): string => {
    if (!id) return "";
    if (typeof id === "string") return id;
    if (typeof id === "object" && id !== null && typeof (id as Record<string, unknown>).toString === "function") {
      const obj = id as Record<string, unknown>;
      const str = String(obj);
      if (str === "[object Object]" && obj.id && obj.tb) return `${obj.tb}:${obj.id}`;
      return str;
    }
    return String(id);
  };
  return {
    id: safeId(raw.id),
    company_id: Number(raw.company_id ?? DEFAULT_COMPANY_ID),
    name: String(raw.name ?? ""),
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}

export async function listProductUnitsAction() {
  const auth = await assertWriteActionSession();
  if (!auth.ok) return { success: false, error: auth.error, data: [] };

  const db = await getDb();
  try {
    const tenantId = await requireActiveTenantId();
    const result = await db.query<[ProductUnit[]]>(
      `SELECT * FROM ${TABLE_NAME} WHERE company_id = $company_id AND tenant_id = $tenantId ORDER BY name ASC`,
      { company_id: DEFAULT_COMPANY_ID, tenantId: tenantRecordId(tenantId) }
    );
    const rows = result[0] ?? [];
    return { success: true, data: rows.map(serializeUnit) };
  } catch (error) {
    console.error("Error listing product units:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: true, data: [] };
  }
}

export async function createProductUnitAction(data: { name: string }) {
  const auth = await assertWriteActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const db = await getDb();
  const validated = createUnitSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    const tenantId = await requireActiveTenantId();
    const existing = await db.query<[ProductUnit[]]>(
      `SELECT * FROM ${TABLE_NAME} WHERE company_id = $company_id AND tenant_id = $tenantId AND string::uppercase(name) = string::uppercase($name)`,
      { company_id: DEFAULT_COMPANY_ID, tenantId: tenantRecordId(tenantId), name: validated.data.name }
    );
    if (existing[0] && existing[0].length > 0) {
      return { success: true, data: serializeUnit(existing[0][0]) };
    }

    const created = await db.create(new Table(TABLE_NAME)).content({
      company_id: DEFAULT_COMPANY_ID,
      tenant_id: tenantRecordId(tenantId),
      name: validated.data.name.toUpperCase(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const unit = Array.isArray(created) ? created[0] : created;
    if (!unit) return { success: false, error: "Erro ao criar unidade" };

    revalidatePath("/dashboard/products");
    const serialized = serializeUnit(unit);
    await auditTenantAction({
        action: "product_unit.create",
        resourceType: "product_unit",
        resourceId: serialized.id,
        summary: `Unidade criada: ${validated.data.name}`,
    });
    return { success: true, data: serialized };
  } catch (error) {
    console.error("Error creating product unit:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao criar unidade" };
  }
}

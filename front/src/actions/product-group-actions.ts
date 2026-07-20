"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Table } from "surrealdb";
import { assertWriteActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError, withDbRetry } from "@/lib/surreal";
import { requireActiveTenantId, tenantRecordId } from "@/lib/tenant-query";
import { assertEntityInActiveTenant } from "@/lib/tenant-access";
import { saveFile, deleteFile } from "@/lib/upload";
import { InvalidRecordIdError, recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";
import { auditTenantAction } from "@/lib/audit-log";

export type ProductGroup = {
  id: string;
  company_id: number;
  name: string;
  description?: string;
  image_url?: string;
  created_at: string;
  updated_at: string;
};

const TABLE_NAME = "product_group";
const DEFAULT_COMPANY_ID = 0;

const groupNameSchema = z.object({
  name: z.string().min(1, "O nome do grupo é obrigatório").trim(),
});

function serializeGroup(raw: Record<string, unknown>): ProductGroup {
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
    description: raw.description ? String(raw.description) : undefined,
    image_url: raw.image_url ? String(raw.image_url) : undefined,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}

export async function listProductGroupsAction() {
  const auth = await assertWriteActionSession();
  if (!auth.ok) return { success: false, error: auth.error, data: [] };

  const db = await getDb();
  try {
    const tenantId = await requireActiveTenantId();
    const result = await db.query<[ProductGroup[]]>(
      `SELECT * FROM ${TABLE_NAME} WHERE company_id = $company_id AND tenant_id = $tenantId ORDER BY name ASC`,
      { company_id: DEFAULT_COMPANY_ID, tenantId: tenantRecordId(tenantId) },
    );
    const rows = result[0] ?? [];
    return { success: true, data: rows.map(serializeGroup) };
  } catch (error) {
    console.error("Error listing product groups:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: true, data: [] };
  }
}

export async function getProductGroupAction(id: string) {
  const auth = await assertWriteActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const entityGate = await assertEntityInActiveTenant(TABLE_NAME, id, "Grupo não encontrado");
  if (!entityGate.ok) return { success: false, error: entityGate.error };

  const db = await getDb();
  try {
    const recordId = requireRecordId(TABLE_NAME, id);
    const result = await db.select<ProductGroup>(recordId);
    const data = Array.isArray(result) ? result[0] : result;
    if (!data) return { success: false, error: "Grupo não encontrado" };
    return { success: true, data: serializeGroup(data as Record<string, unknown>) };
  } catch (error) {
    if (error instanceof InvalidRecordIdError) {
      return { success: false, error: error.message };
    }
    console.error("Error getting product group:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Grupo não encontrado" };
  }
}

export async function createProductGroupAction(formData: FormData) {
  const auth = await assertWriteActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const db = await getDb();
  const name = formData.get("name") as string;
  const validated = groupNameSchema.safeParse({ name });
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message ?? "Dados inválidos" };
  }

  let image_url: string | undefined;
  const imageFile = formData.get("image") as File | null;
  if (imageFile && imageFile.size > 0) {
    if (imageFile.size > 2 * 1024 * 1024) {
      return { success: false, error: "Imagem muito grande (máx. 2MB)" };
    }
    try {
      image_url = await saveFile(imageFile, "product-groups");
    } catch {
      return { success: false, error: "Erro ao salvar imagem" };
    }
  }

  try {
    const tenantId = await requireActiveTenantId();
    const created = await db.create(new Table(TABLE_NAME)).content({
      company_id: DEFAULT_COMPANY_ID,
      tenant_id: tenantRecordId(tenantId),
      name: validated.data.name,
      image_url,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const group = Array.isArray(created) ? created[0] : created;
    if (!group) return { success: false, error: "Erro ao criar grupo" };

    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard/products/groups");
    const serialized = serializeGroup(group as Record<string, unknown>);
    await auditTenantAction({
      action: "product_group.create",
      resourceType: "product_group",
      resourceId: serialized.id,
      summary: `Grupo criado: ${validated.data.name}`,
    });
    return { success: true, data: serialized };
  } catch (error) {
    console.error("Error creating product group:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao criar grupo" };
  }
}

export async function updateProductGroupAction(id: string, formData: FormData) {
  const auth = await assertWriteActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const entityGate = await assertEntityInActiveTenant(TABLE_NAME, id, "Grupo não encontrado");
  if (!entityGate.ok) return { success: false, error: entityGate.error };

  const db = await getDb();
  const name = formData.get("name") as string;
  const validated = groupNameSchema.safeParse({ name });
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message ?? "Dados inválidos" };
  }

  // Get existing group to manage image replacement
  const existingRes = await getProductGroupAction(id);
  const existing = existingRes.success ? existingRes.data : undefined;

  let image_url: string | undefined = existing?.image_url;

  const removeImage = formData.get("removeImage") === "true";
  const imageFile = formData.get("image") as File | null;

  if (removeImage) {
    if (existing?.image_url) {
      await deleteFile(existing.image_url);
    }
    image_url = undefined;
  } else if (imageFile && imageFile.size > 0) {
    if (imageFile.size > 2 * 1024 * 1024) {
      return { success: false, error: "Imagem muito grande (máx. 2MB)" };
    }
    // Delete old image before saving new one
    if (existing?.image_url) {
      await deleteFile(existing.image_url);
    }
    try {
      image_url = await saveFile(imageFile, "product-groups");
    } catch {
      return { success: false, error: "Erro ao salvar imagem" };
    }
  }

  try {
    const recordId = requireRecordId(TABLE_NAME, id);
    const updated = await db.query<[ProductGroup[]]>(
      `UPDATE $record SET name = $name, image_url = $image_url, updated_at = $updated_at`,
      {
        record: recordId,
        name: validated.data.name,
        image_url: image_url ?? null,
        updated_at: new Date().toISOString(),
      }
    );

    const group = updated[0]?.[0];
    if (!group) return { success: false, error: "Grupo não encontrado" };

    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard/products/groups");
    const serialized = serializeGroup(group as Record<string, unknown>);
    await auditTenantAction({
      action: "product_group.update",
      resourceType: "product_group",
      resourceId: id,
      summary: `Grupo atualizado: ${validated.data.name}`,
    });
    return { success: true, data: serialized };
  } catch (error) {
    if (error instanceof InvalidRecordIdError) {
      return { success: false, error: error.message };
    }
    console.error("Error updating product group:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao atualizar grupo" };
  }
}

export async function deleteProductGroupAction(id: string) {
  const auth = await assertWriteActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const entityGate = await assertEntityInActiveTenant(TABLE_NAME, id, "Grupo não encontrado");
  if (!entityGate.ok) return { success: false, error: entityGate.error };

  const db = await getDb();
  try {
    const recordId = requireRecordId(TABLE_NAME, id);

    // Get group first to delete image file
    const existingRes = await getProductGroupAction(id);
    const existing = existingRes.success ? existingRes.data : undefined;

    // Remove group from all products that reference it.
    // StringRecordId obrigatório: group_ids contém RecordId, não string pura.
    await db.query(
      `UPDATE product SET group_ids -= [$id] WHERE group_ids CONTAINS $id`,
      { id: recordId }
    );

    // Delete the group record via db.delete() com StringRecordId
    await db.delete(recordId);

    // Delete image file if exists
    if (existing?.image_url) {
      await deleteFile(existing.image_url);
    }

    revalidatePath("/dashboard/products");
        revalidatePath("/dashboard/products/groups");
        await auditTenantAction({
            action: "product_group.delete",
            resourceType: "product_group",
            resourceId: id,
            summary: "Grupo de produtos excluído",
        });
        return { success: true };
  } catch (error) {
    if (error instanceof InvalidRecordIdError) {
      return { success: false, error: error.message };
    }
    console.error("Error deleting product group:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao excluir grupo" };
  }
}

/** Retorna apenas grupos que possuem pelo menos 1 produto (para seletor no orçamento). */
export async function listProductGroupsWithProductsAction() {
  const auth = await assertWriteActionSession();
  if (!auth.ok) return { success: false, error: auth.error, data: [] };

  const listRes = await listProductGroupsAction();
  if (!listRes.success) {
    return { success: false, error: listRes.error ?? "Falha ao listar grupos", data: [] };
  }
  if (!listRes.data?.length) return { success: true, data: [] };

  const countsRes = await getProductGroupProductCountsAction(listRes.data.map((g) => g.id));
  if (!countsRes.success) {
    return { success: false, error: countsRes.error ?? "Falha ao contar produtos dos grupos", data: [] };
  }
  const withProducts = listRes.data.filter((g) => (countsRes.counts[g.id] ?? 0) > 0);
  return { success: true, data: withProducts };
}

function groupIdLookupKeys(groupId: string): string[] {
  try {
    const rid = requireRecordId(TABLE_NAME, groupId);
    const normalized = recordIdToString(rid) ?? groupId;
    return normalized === groupId ? [groupId] : [groupId, normalized];
  } catch {
    return [groupId];
  }
}

/** Conta produtos por grupo em uma única query (evita N chamadas paralelas ao SurrealDB). */
export async function getProductGroupProductCountsAction(
  groupIds: string[],
): Promise<{ success: boolean; error?: string; counts: Record<string, number> }> {
  const auth = await assertWriteActionSession();
  if (!auth.ok) return { success: false, error: auth.error, counts: {} };

  const counts: Record<string, number> = Object.fromEntries(groupIds.map((id) => [id, 0]));
  if (groupIds.length === 0) return { success: true, counts };

  try {
    const tenantId = await requireActiveTenantId();
    const keyToGroupId = new Map<string, string>();
    for (const groupId of groupIds) {
      for (const key of groupIdLookupKeys(groupId)) {
        keyToGroupId.set(key, groupId);
      }
    }

    await withDbRetry(async (db) => {
      const result = await db.query(
        `SELECT group_ids FROM product WHERE tenant_id = $tenantId AND group_ids != NONE`,
        { tenantId: tenantRecordId(tenantId) },
      );
      const rows = Array.isArray(result[0]) ? result[0] : [];
      for (const row of rows) {
        const gids = (row as Record<string, unknown>).group_ids;
        if (!Array.isArray(gids)) continue;
        for (const gid of gids) {
          const key = recordIdToString(gid) ?? String(gid);
          const groupId = keyToGroupId.get(key);
          if (groupId) counts[groupId] += 1;
        }
      }
    });

    return { success: true, counts };
  } catch (error) {
    console.error("Error fetching product group counts:", error);
    return { success: false, error: "Falha ao contar produtos dos grupos", counts };
  }
}

export async function getProductGroupProductsAction(groupId: string) {
  const auth = await assertWriteActionSession();
  if (!auth.ok) return { success: false, error: auth.error, data: [] };

  try {
    const tenantId = await requireActiveTenantId();
    const groupRecordId = requireRecordId(TABLE_NAME, groupId);

    const products = await withDbRetry(async (db) => {
      const result = await db.query(
        `SELECT id, code, ncm, description, unit, equipmentPrice, assemblyPrice, imageUrl FROM product WHERE tenant_id = $tenantId AND group_ids CONTAINS $groupId`,
        { tenantId: tenantRecordId(tenantId), groupId: groupRecordId },
      );
      const rawProducts = Array.isArray(result[0]) ? result[0] : [];
      return rawProducts.map((p: Record<string, unknown>) => ({
        id: recordIdToString(p.id),
        code: p.code as string,
        ncm: String(p.ncm ?? ""),
        description: p.description as string,
        unit: p.unit as string,
        equipmentPrice: p.equipmentPrice as number,
        assemblyPrice: p.assemblyPrice as number,
        imageUrl: p.imageUrl ? String(p.imageUrl) : undefined,
      }));
    });
    return { success: true, data: products };
  } catch (error) {
    if (error instanceof InvalidRecordIdError) {
      return { success: false, error: error.message, data: [] };
    }
    console.error("Error fetching group products:", error);
    return { success: false, error: "Falha ao buscar produtos do grupo", data: [] };
  }
}

"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { StringRecordId, Table } from "surrealdb";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { saveFile, deleteFile } from "@/lib/upload";

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
  const db = await getDb();
  try {
    const result = await db.query<[ProductGroup[]]>(
      `SELECT * FROM ${TABLE_NAME} WHERE company_id = $company_id ORDER BY name ASC`,
      { company_id: DEFAULT_COMPANY_ID }
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
  const db = await getDb();
  try {
    const decodedId = decodeURIComponent(id);
    const formattedId = decodedId.startsWith("product_group:") ? decodedId : `product_group:${decodedId}`;
    const result = await db.select<ProductGroup>(new StringRecordId(formattedId));
    const data = Array.isArray(result) ? result[0] : result;
    if (!data) return { success: false, error: "Grupo não encontrado" };
    return { success: true, data: serializeGroup(data as Record<string, unknown>) };
  } catch (error) {
    console.error("Error getting product group:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Grupo não encontrado" };
  }
}

export async function createProductGroupAction(formData: FormData) {
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
    const created = await db.create(new Table(TABLE_NAME)).content({
      company_id: DEFAULT_COMPANY_ID,
      name: validated.data.name,
      image_url,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const group = Array.isArray(created) ? created[0] : created;
    if (!group) return { success: false, error: "Erro ao criar grupo" };

    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard/products/groups");
    return { success: true, data: serializeGroup(group as Record<string, unknown>) };
  } catch (error) {
    console.error("Error creating product group:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao criar grupo" };
  }
}

export async function updateProductGroupAction(id: string, formData: FormData) {
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
    const decodedId = decodeURIComponent(id);
    const formattedId = decodedId.startsWith(`${TABLE_NAME}:`) ? decodedId : `${TABLE_NAME}:${decodedId}`;
    const updated = await db.query<[ProductGroup[]]>(
      `UPDATE $record SET name = $name, image_url = $image_url, updated_at = $updated_at`,
      {
        record: new StringRecordId(formattedId),
        name: validated.data.name,
        image_url: image_url ?? null,
        updated_at: new Date().toISOString(),
      }
    );

    const group = updated[0]?.[0];
    if (!group) return { success: false, error: "Grupo não encontrado" };

    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard/products/groups");
    return { success: true, data: serializeGroup(group as Record<string, unknown>) };
  } catch (error) {
    console.error("Error updating product group:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao atualizar grupo" };
  }
}

export async function deleteProductGroupAction(id: string) {
  const db = await getDb();
  try {
    const decodedId = decodeURIComponent(id);
    const formattedId = decodedId.startsWith(`${TABLE_NAME}:`) ? decodedId : `${TABLE_NAME}:${decodedId}`;
    const recordId = new StringRecordId(formattedId);

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
    return { success: true };
  } catch (error) {
    console.error("Error deleting product group:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao excluir grupo" };
  }
}

/** Retorna apenas grupos que possuem pelo menos 1 produto (para seletor no orçamento). */
export async function listProductGroupsWithProductsAction() {
  const listRes = await listProductGroupsAction();
  if (!listRes.success || !listRes.data) return { success: true, data: [] };

  const withProducts: ProductGroup[] = [];
  for (const g of listRes.data) {
    const prodsRes = await getProductGroupProductsAction(g.id);
    if (prodsRes.success && prodsRes.data && prodsRes.data.length > 0) {
      withProducts.push(g);
    }
  }
  return { success: true, data: withProducts };
}

export async function getProductGroupProductsAction(groupId: string) {
  const db = await getDb();
  try {
    const decodedGroupId = decodeURIComponent(groupId);
    const formattedGroupId = decodedGroupId.startsWith(`${TABLE_NAME}:`) ? decodedGroupId : `${TABLE_NAME}:${decodedGroupId}`;
    const groupRecordId = new StringRecordId(formattedGroupId);

    const result = await db.query(
      `SELECT id, code, description, unit, equipmentPrice, assemblyPrice, imageUrl FROM product WHERE group_ids CONTAINS $groupId`,
      { groupId: groupRecordId }
    );
    const rawProducts = Array.isArray(result[0]) ? result[0] : [];
    const products = rawProducts.map((p: Record<string, unknown>) => ({
      id: typeof p.id === "string" ? p.id : `${(p.id as Record<string, unknown>).tb}:${(p.id as Record<string, unknown>).id}`,
      code: p.code as string,
      description: p.description as string,
      unit: p.unit as string,
      equipmentPrice: p.equipmentPrice as number,
      assemblyPrice: p.assemblyPrice as number,
      imageUrl: p.imageUrl ? String(p.imageUrl) : undefined,
    }));
    return { success: true, data: products };
  } catch (error) {
    console.error("Error fetching group products:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: true, data: [] };
  }
}

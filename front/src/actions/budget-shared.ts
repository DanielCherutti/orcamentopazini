// Helpers compartilhados para actions de orçamento.
// Mantém serialização consistente entre listagem, detalhe e operações.

import { dbAnnotationsToFrontend } from "@/lib/budgets/annotation-convert";

type DbEntity = Record<string, unknown>;

export function serializeBudgetEntity<T extends DbEntity>(item: T): T {
  if (!item) return item;

  const newItem = { ...item } as Record<string, unknown>;
  if (newItem.id) newItem.id = String(newItem.id);

  // Recursively serialize children if they exist
  if (Array.isArray(newItem.locations)) newItem.locations = newItem.locations.map(serializeBudgetEntity);
  if (Array.isArray(newItem.sections)) newItem.sections = newItem.sections.map(serializeBudgetEntity);
  if (Array.isArray(newItem.items)) newItem.items = newItem.items.map(serializeBudgetEntity);
  if (Array.isArray(newItem.images)) {
    newItem.images = newItem.images.map((img: DbEntity) => {
      const serialized = serializeBudgetEntity(img);
      if (Array.isArray(serialized.annotations)) {
        serialized.annotations = dbAnnotationsToFrontend(serialized.annotations);
      }
      return serialized;
    });
  }

  // Relations:
  // - client_id: string id. Se vier expandido (FETCH), também preenche client_name / client_cnpj.
  // - Demais relações: preservar o objeto se vier via FETCH (product_id usa dados para UI).
  // Serializa campos de data para ISO string
  if (newItem.created_at) newItem.created_at = String(newItem.created_at);
  if (newItem.updated_at) newItem.updated_at = String(newItem.updated_at);

  const serializeRelationAsId = (value: unknown): string => {
    if (!value) return "";
    if (typeof value === "object" && value !== null && "id" in (value as Record<string, unknown>)) {
      return String((value as Record<string, unknown>).id);
    }
    return String(value);
  };

  const serializeRelation = (value: unknown): unknown => {
    if (!value) return value;
    if (typeof value === "object" && value !== null) {
      const cloned = { ...value } as Record<string, unknown>;
      if (cloned.id) cloned.id = String(cloned.id);
      // Serializa arrays aninhados (ex: group_ids no produto contém RecordId objects)
      for (const key of Object.keys(cloned)) {
        if (Array.isArray(cloned[key])) {
          cloned[key] = (cloned[key] as unknown[]).map((item) =>
            typeof item === "object" && item !== null ? String(item) : item
          );
        }
      }
      return cloned;
    }
    return String(value);
  };

  const rawClient = newItem.client_id;
  if (rawClient && typeof rawClient === "object" && !Array.isArray(rawClient) && "id" in rawClient) {
    const c = rawClient as Record<string, unknown>;
    newItem.client_id = String(c.id ?? "");
    if (c.name != null) newItem.client_name = String(c.name);
    if (c.cnpj != null) newItem.client_cnpj = String(c.cnpj);
  } else {
    newItem.client_id = serializeRelationAsId(rawClient);
  }
  newItem.budget_id = serializeRelation(newItem.budget_id);
  newItem.location_id = serializeRelation(newItem.location_id);
  newItem.section_id = serializeRelation(newItem.section_id);
  newItem.product_id = serializeRelation(newItem.product_id);
  if (newItem.block_id) newItem.block_id = String(newItem.block_id);
  if (newItem.parent_id) newItem.parent_id = String(newItem.parent_id);
  if (newItem.group_id) newItem.group_id = String(newItem.group_id);
  if (newItem.group_instance_id) newItem.group_instance_id = String(newItem.group_instance_id);

  return newItem as T;
}


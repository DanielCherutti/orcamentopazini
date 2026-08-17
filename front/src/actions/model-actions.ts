"use server";

import { revalidatePath } from "next/cache";
import { Table } from "surrealdb";
import { z } from "zod";
import { assertActionSession, assertWriteActionSession } from "@/actions/auth-actions";
import {
  ensureCompositorCoverBlockAction,
  ensureCompositorHeaderFooterBlockAction,
  ensureCompositorQuoteBlockAction,
  ensureCompositorTocBlockAction,
} from "@/actions/budget-compositor-block-actions";
import { auditTenantAction } from "@/lib/audit-log";
import { assertBudgetInActiveTenant } from "@/lib/budget-tenant";
import { getDb, isTokenExpiredError, resetDb, toPlain } from "@/lib/surreal";
import { recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";
import { assertEntityInActiveTenant } from "@/lib/tenant-access";
import { requireActiveTenantId, tenantRecordId } from "@/lib/tenant-query";
import { isBudgetEditableStatus } from "@/lib/budgets/budget-status";
import { budgetRevalidatePath } from "@/lib/budgets/budget-path";
import { stripHtmlToText } from "@/lib/pdf/html-to-plain-text";
import { sanitizeRichHtmlForStorage } from "@/lib/pdf/sanitize-inline-styles-for-pdf";
import { DEFAULT_COVER_PROPS, DEFAULT_HEADER_FOOTER_PROPS } from "@/types/budget-compositor-types";
import {
  modelTemplateToLegacyContent,
  normalizeModelTemplateStructure,
  type ModelTemplateBlock,
  type ModelTemplateStructure,
} from "@/lib/model-template-structure";

const modeloTipos = ["cabecalho", "rodape", "capa", "orcamento_completo", "databook_completo"] as const;
export type ModeloTipo = (typeof modeloTipos)[number];

export type Modelo = {
  id: string;
  nome: string;
  tipo: ModeloTipo;
  conteudo: string;
  estrutura: ModelTemplateStructure;
  created_at?: string;
  updated_at?: string;
};

export type ModeloFormInput = {
  nome: string;
  tipo: ModeloTipo;
  conteudo: string;
  estrutura?: ModelTemplateStructure;
};

const modeloSchema = z.object({
  nome: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  tipo: z.enum(modeloTipos),
  conteudo: z.string().default(""),
  estrutura: z.unknown().optional(),
});

function serializeId(raw: unknown): string {
  if (!raw) return "";
  return String(raw);
}

function serializeModelo(record: Record<string, unknown>): Modelo {
  const tipo = modeloTipos.includes(record.tipo as ModeloTipo)
    ? (record.tipo as ModeloTipo)
    : "orcamento_completo";
  const conteudo = String(record.conteudo ?? "");
  return {
    id: serializeId(record.id),
    nome: String(record.nome ?? ""),
    tipo,
    conteudo,
    estrutura: normalizeModelTemplateStructure(tipo, record.estrutura, conteudo),
    created_at: record.created_at ? String(record.created_at) : undefined,
    updated_at: record.updated_at ? String(record.updated_at) : undefined,
  };
}

function sanitizeModeloStructure(
  tipo: ModeloTipo,
  raw: unknown,
  legacyContent: string,
): ModelTemplateStructure {
  const structure = normalizeModelTemplateStructure(tipo, raw, legacyContent);
  if (structure.kind === "cover") {
    return {
      ...structure,
      props: {
        ...structure.props,
        cover_document_html: sanitizeRichHtmlForStorage(
          structure.props.cover_document_html ?? "",
        ),
      },
    };
  }
  if (structure.kind === "budget") {
    return {
      ...structure,
      blocks: structure.blocks.map((block) => {
        const props = { ...block.props };
        if (block.type === "cover") {
          props.cover_document_html = sanitizeRichHtmlForStorage(
            String(props.cover_document_html ?? ""),
          );
        }
        if (block.type === "session") {
          props.description = sanitizeRichHtmlForStorage(String(props.description ?? ""));
        }
        if (block.type === "text") {
          props.content = sanitizeRichHtmlForStorage(String(props.content ?? ""));
        }
        return { ...block, props };
      }),
    };
  }
  return structure;
}

function prepareModeloPayload(data: z.infer<typeof modeloSchema>) {
  const estrutura = sanitizeModeloStructure(data.tipo, data.estrutura, data.conteudo);
  const serialized = JSON.stringify(estrutura);
  if (serialized.length > 2_000_000) {
    throw new Error("O modelo excede o limite de 2 MB");
  }
  return {
    nome: data.nome.trim(),
    tipo: data.tipo,
    conteudo: sanitizeRichHtmlForStorage(modelTemplateToLegacyContent(estrutura)),
    estrutura,
  };
}

export async function listModelosAction(params?: {
  tipo?: ModeloTipo | "todos";
  query?: string;
}) {
  const auth = await assertActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const db = await getDb();
  try {
    const tenantId = await requireActiveTenantId();
    let sql = "SELECT * FROM modelos WHERE tenant_id = $tenantId";
    const queryParams: Record<string, unknown> = {
      tenantId: tenantRecordId(tenantId),
    };
    if (params?.tipo && params.tipo !== "todos") {
      sql += " AND tipo = $tipo";
      queryParams.tipo = params.tipo;
    }
    if (params?.query?.trim()) {
      sql += " AND string::lowercase(nome) CONTAINS string::lowercase($query)";
      queryParams.query = params.query.trim();
    }
    sql += " ORDER BY tipo ASC, nome ASC";

    const result = await db.query<[Record<string, unknown>[]]>(sql, queryParams);
    return { success: true, data: toPlain((result[0] ?? []).map(serializeModelo)) };
  } catch (error) {
    console.error("listModelosAction:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao listar modelos" };
  }
}

export async function getModeloAction(id: string) {
  const auth = await assertActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const gate = await assertEntityInActiveTenant("modelos", id, "Modelo não encontrado");
  if (!gate.ok) return { success: false, error: gate.error };

  const db = await getDb();
  try {
    const record = await db.select<Record<string, unknown>>(requireRecordId("modelos", id));
    const row = Array.isArray(record) ? record[0] : record;
    if (!row) return { success: false, error: "Modelo não encontrado" };
    return { success: true, data: toPlain(serializeModelo(row)) };
  } catch (error) {
    console.error("getModeloAction:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao carregar modelo" };
  }
}

export async function createModeloAction(data: ModeloFormInput) {
  const auth = await assertWriteActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = modeloSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      error: "Erro de validação",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const db = await getDb();
  try {
    const tenantId = await requireActiveTenantId();
    const payload = prepareModeloPayload(parsed.data);
    await db.create(new Table("modelos")).content({
      ...payload,
      tenant_id: tenantRecordId(tenantId),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    revalidatePath("/modelos");
    await auditTenantAction({
      action: "modelo.create",
      resourceType: "modelo",
      summary: `Modelo criado: ${parsed.data.nome}`,
      metadata: { tipo: parsed.data.tipo },
    });
    return { success: true };
  } catch (error) {
    console.error("createModeloAction:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao criar modelo" };
  }
}

export async function updateModeloAction(id: string, data: ModeloFormInput) {
  const auth = await assertWriteActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const gate = await assertEntityInActiveTenant("modelos", id, "Modelo não encontrado");
  if (!gate.ok) return { success: false, error: gate.error };

  const parsed = modeloSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      error: "Erro de validação",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const db = await getDb();
  try {
    const payload = prepareModeloPayload(parsed.data);
    await db.update(requireRecordId("modelos", id)).merge({
      ...payload,
      updated_at: new Date().toISOString(),
    });
    revalidatePath("/modelos");
    await auditTenantAction({
      action: "modelo.update",
      resourceType: "modelo",
      resourceId: id,
      summary: `Modelo atualizado: ${parsed.data.nome}`,
      metadata: { tipo: parsed.data.tipo },
    });
    return { success: true };
  } catch (error) {
    console.error("updateModeloAction:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao atualizar modelo" };
  }
}

export async function deleteModeloAction(id: string) {
  const auth = await assertWriteActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const gate = await assertEntityInActiveTenant("modelos", id, "Modelo não encontrado");
  if (!gate.ok) return { success: false, error: gate.error };

  const db = await getDb();
  try {
    await db.delete(requireRecordId("modelos", id));
    revalidatePath("/modelos");
    await auditTenantAction({
      action: "modelo.delete",
      resourceType: "modelo",
      resourceId: id,
      summary: "Modelo excluído",
    });
    return { success: true };
  } catch (error) {
    console.error("deleteModeloAction:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao excluir modelo" };
  }
}

function contentHasText(raw: unknown): boolean {
  const html = String(raw ?? "");
  if (!html.trim()) return false;
  return stripHtmlToText(html).replace(/\s+/g, " ").trim().length > 0;
}

export async function getBudgetModelImportImpactAction(budgetId: string) {
  const auth = await assertActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const db = await getDb();
  try {
    const gate = await assertBudgetInActiveTenant(budgetId, db);
    if (!gate.ok) return { success: false, error: gate.error };

    const rows = await db.query<[Array<{ type?: string; props?: Record<string, unknown> }>]>(
      "SELECT type, props FROM budget_block WHERE budget_id = $budgetId AND deleted_at IS NONE",
      { budgetId: gate.budgetRecordId },
    );
    const hasCurrentContent = (rows[0] ?? []).some((row) => {
      const props = row.props ?? {};
      return (
        contentHasText(props.cover_document_html) ||
        contentHasText(props.description) ||
        contentHasText(props.content) ||
        contentHasText(props.cover_header_html) ||
        contentHasText(props.cover_footer_html) ||
        contentHasText(props.inner_header_html) ||
        contentHasText(props.inner_footer_html)
      );
    });
    return { success: true, data: { hasCurrentContent } };
  } catch (error) {
    console.error("getBudgetModelImportImpactAction:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao analisar conteúdo do orçamento" };
  }
}

async function findRootBlock(
  db: Awaited<ReturnType<typeof getDb>>,
  budgetRecordId: ReturnType<typeof requireRecordId>,
  type: string,
): Promise<{ id: string; props?: Record<string, unknown> } | null> {
  const rows = await db.query<[Array<{ id: unknown; props?: Record<string, unknown> }>]>(
    "SELECT id, props, order_index FROM budget_block WHERE budget_id = $budgetId AND parent_id IS NONE AND type = $type AND deleted_at IS NONE ORDER BY order_index ASC LIMIT 1",
    { budgetId: budgetRecordId, type },
  );
  const row = rows[0]?.[0];
  return row ? { id: String(row.id), props: row.props ?? {} } : null;
}

async function mergeBlockProps(
  db: Awaited<ReturnType<typeof getDb>>,
  blockId: string,
  props: Record<string, unknown>,
) {
  const recordId = requireRecordId("budget_block", blockId);
  const raw = await db.select<Record<string, unknown>>(recordId);
  const row = Array.isArray(raw) ? raw[0] : raw;
  const currentProps =
    row?.props && typeof row.props === "object" && !Array.isArray(row.props)
      ? (row.props as Record<string, unknown>)
      : {};
  await db.update(recordId).merge({
    props: { ...currentProps, ...props },
    updated_at: new Date().toISOString(),
  });
}

async function importCoverModel(
  db: Awaited<ReturnType<typeof getDb>>,
  budgetId: string,
  budgetRecordId: ReturnType<typeof requireRecordId>,
  modelo: Modelo,
) {
  await ensureCompositorCoverBlockAction(budgetId);
  const cover = await findRootBlock(db, budgetRecordId, "cover");
  if (!cover) throw new Error("Bloco de capa não encontrado");
  const structure = normalizeModelTemplateStructure(modelo.tipo, modelo.estrutura, modelo.conteudo);
  const modelProps = structure.kind === "cover"
    ? structure.props
    : { ...DEFAULT_COVER_PROPS, cover_document_html: modelo.conteudo };
  await mergeBlockProps(db, cover.id, { ...DEFAULT_COVER_PROPS, ...modelProps });
}

async function importHeaderFooterModel(
  db: Awaited<ReturnType<typeof getDb>>,
  budgetId: string,
  budgetRecordId: ReturnType<typeof requireRecordId>,
  modelo: Modelo,
  targetPageScope: "all" | "cover" | "inner" = "all",
) {
  await ensureCompositorHeaderFooterBlockAction(budgetId, { skipRevalidate: true });
  const block = await findRootBlock(db, budgetRecordId, "header_footer");
  if (!block) throw new Error("Bloco de cabeçalho e rodapé não encontrado");
  const isHeader = modelo.tipo === "cabecalho";
  const structure = normalizeModelTemplateStructure(modelo.tipo, modelo.estrutura, modelo.conteudo);
  if (structure.kind !== "header_footer") {
    throw new Error("Estrutura visual do modelo inválida");
  }
  const source = structure.props;
  const modelLayout = isHeader ? source.all_header_layout : source.all_footer_layout;

  let patch: Record<string, unknown> = {};

  if (isHeader) {
    if (targetPageScope === "all") {
      patch = {
        header_footer_scope_mode: "all",
        cover_show_header_band: true,
        inner_show_header_band: true,
        cover_header_height: source.cover_header_height ?? 96,
        inner_header_height: source.inner_header_height ?? 96,
        all_header_layout: modelLayout,
        page_numbering: source.page_numbering,
      };
    } else if (targetPageScope === "cover") {
      patch = {
        header_footer_scope_mode: "split",
        cover_show_header_band: true,
        cover_header_height: source.cover_header_height ?? 96,
        cover_header_layout: modelLayout,
      };
    } else if (targetPageScope === "inner") {
      patch = {
        header_footer_scope_mode: "split",
        inner_show_header_band: true,
        inner_header_height: source.inner_header_height ?? 96,
        inner_header_layout: modelLayout,
      };
    }
  } else {
    // Rodapé
    if (targetPageScope === "all") {
      patch = {
        header_footer_scope_mode: "all",
        cover_show_footer_band: true,
        inner_show_footer_band: true,
        cover_footer_height: source.cover_footer_height ?? 40,
        inner_footer_height: source.inner_footer_height ?? 40,
        all_footer_layout: modelLayout,
        page_numbering: source.page_numbering,
      };
    } else if (targetPageScope === "cover") {
      patch = {
        header_footer_scope_mode: "split",
        cover_show_footer_band: true,
        cover_footer_height: source.cover_footer_height ?? 40,
        cover_footer_layout: modelLayout,
      };
    } else if (targetPageScope === "inner") {
      patch = {
        header_footer_scope_mode: "split",
        inner_show_footer_band: true,
        inner_footer_height: source.inner_footer_height ?? 40,
        inner_footer_layout: modelLayout,
      };
    }
  }

  await mergeBlockProps(db, block.id, {
    ...DEFAULT_HEADER_FOOTER_PROPS,
    ...(block.props ?? {}),
    ...patch,
  });
}

async function importTemplateAuthoredBlocks(
  db: Awaited<ReturnType<typeof getDb>>,
  budgetRecordId: ReturnType<typeof requireRecordId>,
  blocks: ModelTemplateBlock[],
  rootOrder: Map<string, number>,
) {
  const authored = blocks.filter(
    (block) => block.type === "session" || block.type === "text" || block.type === "scope",
  );
  const createdIds = new Map<string, ReturnType<typeof requireRecordId>>();
  const pending = [...authored];

  while (pending.length) {
    const before = pending.length;
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const block = pending[index]!;
      const parentId = block.parent_id ? createdIds.get(block.parent_id) : null;
      if (block.parent_id && !parentId) continue;
      const inserted = await db.create(new Table("budget_block")).content({
        budget_id: budgetRecordId,
        parent_id: parentId,
        type: block.type,
        label: block.label,
        order_index: block.parent_id ? block.order_index : rootOrder.get(block.id) ?? 99990,
        props: block.props,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      const row = Array.isArray(inserted) ? inserted[0] : inserted;
      const id = recordIdToString((row as { id?: unknown } | undefined)?.id);
      if (id) createdIds.set(block.id, requireRecordId("budget_block", id));
      pending.splice(index, 1);
    }
    if (pending.length === before) {
      throw new Error("A estrutura do modelo contém uma referência de seção inválida");
    }
  }
}

async function importCompleteBudgetModel(
  db: Awaited<ReturnType<typeof getDb>>,
  budgetId: string,
  budgetRecordId: ReturnType<typeof requireRecordId>,
  modelo: Modelo,
) {
  await ensureCompositorCoverBlockAction(budgetId);
  await ensureCompositorHeaderFooterBlockAction(budgetId, { skipRevalidate: true });
  await ensureCompositorTocBlockAction(budgetId);
  await ensureCompositorQuoteBlockAction(budgetId, { skipRevalidate: true });

  await db.query(
    `UPDATE budget_block
     SET deleted_at = time::now(), updated_at = time::now()
     WHERE budget_id = $budgetId
       AND deleted_at IS NONE
       AND type INSIDE ["session", "text", "location", "section", "terms"]`,
    { budgetId: budgetRecordId },
  );

  const structure = normalizeModelTemplateStructure(modelo.tipo, modelo.estrutura, modelo.conteudo);
  if (structure.kind !== "budget") {
    throw new Error("Estrutura do modelo de orçamento inválida");
  }

  const coverTemplate = structure.blocks.find((block) => block.type === "cover");
  const headerFooterTemplate = structure.blocks.find((block) => block.type === "header_footer");
  const figuresTemplate = structure.blocks.find((block) => block.type === "figures");
  const tocTemplate = structure.blocks.find((block) => block.type === "toc");
  const quoteTemplate = structure.blocks.find((block) => block.type === "quote");
  const cover = await findRootBlock(db, budgetRecordId, "cover");
  const headerFooter = await findRootBlock(db, budgetRecordId, "header_footer");
  const figures = await findRootBlock(db, budgetRecordId, "figures");
  const toc = await findRootBlock(db, budgetRecordId, "toc");
  const quote = await findRootBlock(db, budgetRecordId, "quote");
  const orderedRoots = structure.blocks
    .filter((block) => block.parent_id === null)
    .sort((a, b) => a.order_index - b.order_index);
  const hasCompleteBudgetRootLayout = Boolean(figuresTemplate && tocTemplate);
  const rootOrder = new Map(
    orderedRoots.map((block, index) => [
      block.id,
      hasCompleteBudgetRootLayout || block.type === "cover" || block.type === "header_footer"
        ? index
        : index + 2,
    ]),
  );

  const applyRootOrder = async (
    current: { id: string } | null,
    template: ModelTemplateBlock | undefined,
  ) => {
    if (!current || !template) return;
    await db.update(requireRecordId("budget_block", current.id)).merge({
      order_index: rootOrder.get(template.id) ?? 99990,
      updated_at: new Date().toISOString(),
    });
  };

  if (cover && coverTemplate) {
    await mergeBlockProps(db, cover.id, { ...DEFAULT_COVER_PROPS, ...coverTemplate.props });
    await applyRootOrder(cover, coverTemplate);
  }
  if (headerFooter && headerFooterTemplate) {
    await mergeBlockProps(db, headerFooter.id, {
      ...DEFAULT_HEADER_FOOTER_PROPS,
      ...headerFooterTemplate.props,
    });
    await applyRootOrder(headerFooter, headerFooterTemplate);
  }
  await applyRootOrder(figures, figuresTemplate);
  await applyRootOrder(toc, tocTemplate);
  if (quote && quoteTemplate) {
    await mergeBlockProps(db, quote.id, quoteTemplate.props);
    await applyRootOrder(quote, quoteTemplate);
  }
  await importTemplateAuthoredBlocks(db, budgetRecordId, structure.blocks, rootOrder);
}

export async function importModeloToBudgetAction(
  budgetId: string,
  modeloId: string,
  targetPageScope: "all" | "cover" | "inner" = "all",
) {
  console.log("[SERVER ACTION] importModeloToBudgetAction called with:", { budgetId, modeloId, targetPageScope });
  const auth = await assertWriteActionSession();
  if (!auth.ok) {
    console.error("[SERVER ACTION] Auth failed:", auth.error);
    return { success: false, error: auth.error };
  }

  const db = await getDb();
  try {
    const budgetGate = await assertBudgetInActiveTenant(budgetId, db);
    if (!budgetGate.ok) {
      console.error("[SERVER ACTION] Budget tenant check failed:", budgetGate.error);
      return { success: false, error: budgetGate.error };
    }

    const modeloGate = await assertEntityInActiveTenant("modelos", modeloId, "Modelo não encontrado", db);
    if (!modeloGate.ok) {
      console.error("[SERVER ACTION] Model tenant check failed:", modeloGate.error);
      return { success: false, error: modeloGate.error };
    }

    const budgetRaw = await db.select<Record<string, unknown>>(budgetGate.budgetRecordId);
    const budget = Array.isArray(budgetRaw) ? budgetRaw[0] : budgetRaw;
    if (!budget) {
      console.error("[SERVER ACTION] Budget not found in DB");
      return { success: false, error: "Orçamento não encontrado" };
    }
    if (!isBudgetEditableStatus(String(budget.status ?? ""))) {
      console.error("[SERVER ACTION] Budget status is not editable:", budget.status);
      return { success: false, error: "Este orçamento não pode ser alterado." };
    }

    const modeloRaw = await db.select<Record<string, unknown>>(requireRecordId("modelos", modeloId));
    const modeloRow = Array.isArray(modeloRaw) ? modeloRaw[0] : modeloRaw;
    if (!modeloRow) {
      console.error("[SERVER ACTION] Model not found in DB");
      return { success: false, error: "Modelo não encontrado" };
    }
    const modelo = serializeModelo(modeloRow);
    console.log("[SERVER ACTION] Model successfully loaded:", { tipo: modelo.tipo, nome: modelo.nome });

    if (modelo.tipo === "capa") {
      console.log("[SERVER ACTION] Importing cover model...");
      await importCoverModel(db, budgetId, budgetGate.budgetRecordId, modelo);
    } else if (modelo.tipo === "cabecalho" || modelo.tipo === "rodape") {
      console.log("[SERVER ACTION] Importing header/footer model with scope:", targetPageScope);
      await importHeaderFooterModel(db, budgetId, budgetGate.budgetRecordId, modelo, targetPageScope);
    } else {
      console.log("[SERVER ACTION] Importing complete budget model...");
      await importCompleteBudgetModel(db, budgetId, budgetGate.budgetRecordId, modelo);
    }

    console.log("[SERVER ACTION] Revalidating paths...");
    revalidatePath(budgetRevalidatePath(budgetId));
    revalidatePath("/budgets");
    await auditTenantAction({
      action: "budget.import_modelo",
      resourceType: "budget",
      resourceId: budgetId,
      summary: `Modelo importado: ${modelo.nome}`,
      metadata: { modeloId, tipo: modelo.tipo },
    });
    console.log("[SERVER ACTION] Import completed successfully!");
    return { success: true };
  } catch (error) {
    console.error("[SERVER ACTION] Error during importModeloToBudgetAction:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao importar modelo" };
  }
}

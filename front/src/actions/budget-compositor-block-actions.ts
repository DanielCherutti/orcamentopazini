"use server";

import { Table } from "surrealdb";
import { assertWriteActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { revalidatePath } from "next/cache";
import { budgetRevalidatePath } from "@/lib/budgets/budget-path";
import { InvalidRecordIdError, requireRecordId } from "@/lib/surreal-record-ids";
import { mergeCoverDocumentProps } from "@/lib/budgets/cover-document";
import { sanitizeCompositorBlockPropsForPersistence } from "@/lib/pdf/sanitize-inline-styles-for-pdf";
import { DEFAULT_HEADER_FOOTER_PROPS } from "@/types/budget-compositor-types";
import {
    assertBudgetChildInActiveTenant,
    assertBudgetInActiveTenant,
} from "@/lib/budget-tenant";
import { auditTenantAction } from "@/lib/audit-log";

type RootBlockRow = { id: unknown; order_index: number; type: string; props?: Record<string, unknown> };

async function listRootBlocks(
    db: Awaited<ReturnType<typeof getDb>>,
    budgetRecordId: ReturnType<typeof requireRecordId>
): Promise<RootBlockRow[]> {
    const rootsRes = await db.query<[RootBlockRow[]]>(
        "SELECT id, order_index, type, props FROM budget_block WHERE budget_id = $budgetId AND parent_id IS NONE AND deleted_at IS NONE ORDER BY order_index ASC",
        { budgetId: budgetRecordId }
    );
    return rootsRes[0] || [];
}

async function normalizeFixedRootOrder(
    db: Awaited<ReturnType<typeof getDb>>,
    budgetRecordId: ReturnType<typeof requireRecordId>
) {
    const roots = await listRootBlocks(db, budgetRecordId);
    const cover = roots.find((r) => r.type === "cover");
    const headerFooter = roots.find((r) => r.type === "header_footer");
    const toc = roots.find((r) => r.type === "toc");
    const figures = roots.find((r) => r.type === "figures");
    if (!cover || !headerFooter || !toc || !figures) return;
    const scope = roots.find((r) => r.type === "scope");
    const tocAndFiguresSorted = [toc, figures].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    const othersSorted = roots
        .filter(
            (r) =>
                r.type !== "cover" &&
                r.type !== "header_footer" &&
                r.type !== "toc" &&
                r.type !== "figures" &&
                r.type !== "scope"
        )
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    const ordered = scope
        ? [cover, headerFooter, ...tocAndFiguresSorted, scope, ...othersSorted]
        : [cover, headerFooter, ...tocAndFiguresSorted, ...othersSorted];
    for (let i = 0; i < ordered.length; i++) {
        await db.update(requireRecordId("budget_block", String(ordered[i].id))).merge({
            order_index: i,
        });
    }
}

function headerFooterLegacyPropsFromCover(coverProps: Record<string, unknown> | undefined) {
    const c = (coverProps ?? {}) as Record<string, unknown>;
    const coverWm = String(c.cover_watermark_url ?? "");
    const innerWm = String(c.document_watermark_url ?? "");
    return {
        ...DEFAULT_HEADER_FOOTER_PROPS,
        cover_show_header_band: c.cover_pdf_show_header_band !== false,
        cover_show_footer_band: c.cover_pdf_show_footer_band !== false,
        cover_watermark_url: coverWm,
        cover_watermark_opacity: Number(c.cover_watermark_opacity ?? 0.12),
        cover_watermark_scale_pct: 100,
        cover_watermark_x_pct: 11,
        cover_watermark_y_pct: 11,
        cover_watermark_width_pct: 78,
        cover_watermark_aspect: 1,
        inner_use_cover_watermark: innerWm.trim().length === 0,
        inner_watermark_url: innerWm,
        inner_watermark_opacity: Number(c.document_watermark_opacity ?? 0.06),
        inner_watermark_scale_pct: 100,
        inner_watermark_x_pct: 11,
        inner_watermark_y_pct: 11,
        inner_watermark_width_pct: 78,
        inner_watermark_aspect: 1,
        legacy_cover_pdf_show_header_band: c.cover_pdf_show_header_band !== false,
        legacy_cover_pdf_show_footer_band: c.cover_pdf_show_footer_band !== false,
        legacy_cover_pdf_header_company_override: String(c.cover_pdf_header_company_override ?? ""),
        legacy_cover_pdf_header_logo_url_override: String(c.cover_pdf_header_logo_url_override ?? ""),
        legacy_cover_pdf_footer_left_template: String(c.cover_pdf_footer_left_template ?? ""),
        legacy_cover_pdf_footer_right_template: String(c.cover_pdf_footer_right_template ?? ""),
    };
}

/**
 * Garante um bloco `cover` na raiz (order_index 0) para orçamentos compositor.
 * Orçamentos antigos sem capa recebem o bloco na próxima carga da árvore.
 */
export async function ensureCompositorCoverBlockAction(
    budgetId: string
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetInActiveTenant(budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const budgetRecordId = gate.budgetRecordId;

        const rootsRes = await db.query<[Array<{ id: unknown; order_index: number; type: string }>]>(
            "SELECT id, order_index, type FROM budget_block WHERE budget_id = $budgetId AND parent_id IS NONE AND deleted_at IS NONE ORDER BY order_index ASC",
            { budgetId: budgetRecordId }
        );
        const roots = rootsRes[0] || [];
        if (roots.some((r) => r.type === "cover")) {
            return { success: true };
        }

        for (const r of roots) {
            const rid = requireRecordId("budget_block", String(r.id));
            await db.update(rid).merge({ order_index: (r.order_index ?? 0) + 1 });
        }

        await db.create(new Table("budget_block")).content({
            budget_id: budgetRecordId,
            type: "cover",
            label: "CAPA",
            order_index: 0,
            props: mergeCoverDocumentProps({}) as Record<string, unknown>,
        });

        revalidatePath(budgetRevalidatePath(budgetId));
        await auditTenantAction({
            action: "budget_block.ensure",
            resourceType: "budget",
            resourceId: budgetId,
            summary: "Bloco de capa garantido no compositor",
            metadata: { blockType: "cover" },
        });
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("ensureCompositorCoverBlockAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao garantir bloco de capa" };
    }
}

/**
 * Garante um bloco fixo `header_footer` na raiz entre CAPA e SUMÁRIO.
 * Migra configurações antigas de faixa da capa para props legadas de fallback.
 */
export async function ensureCompositorHeaderFooterBlockAction(
    budgetId: string,
    options?: { skipRevalidate?: boolean }
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetInActiveTenant(budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const budgetRecordId = gate.budgetRecordId;
        let roots = await listRootBlocks(db, budgetRecordId);

        const dupes = roots.filter((r) => r.type === "header_footer");
        if (dupes.length > 1) {
            const sorted = [...dupes].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
            for (let i = 1; i < sorted.length; i++) {
                await deleteBlockCascade(db, String(sorted[i].id));
            }
            roots = await listRootBlocks(db, budgetRecordId);
        }

        if (!roots.some((r) => r.type === "header_footer")) {
            const coverRow = roots.find((r) => r.type === "cover");
            const legacyProps = headerFooterLegacyPropsFromCover(coverRow?.props);
            await db.create(new Table("budget_block")).content({
                budget_id: budgetRecordId,
                type: "header_footer",
                label: "CABEÇALHO E RODAPÉ",
                order_index: 99998,
                props: legacyProps,
            });
            await normalizeFixedRootOrder(db, budgetRecordId);
        }

        if (!options?.skipRevalidate) {
            revalidatePath(budgetRevalidatePath(budgetId));
        }
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("ensureCompositorHeaderFooterBlockAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao garantir bloco de cabeçalho e rodapé" };
    }
}

/**
 * Garante blocos fixos na raiz (capa, cabeçalho/rodapé, sumário, lista de figuras).
 * A ordem padrão só é normalizada quando toc/figures é criado nesta execução.
 */
export async function ensureCompositorTocBlockAction(
    budgetId: string
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetInActiveTenant(budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const budgetRecordId = gate.budgetRecordId;
        let roots = await listRootBlocks(db, budgetRecordId);
        let createdTocOrFigures = false;

        const tocDupes = roots.filter((r) => r.type === "toc");
        if (tocDupes.length > 1) {
            const sorted = [...tocDupes].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
            for (let i = 1; i < sorted.length; i++) {
                await deleteBlockCascade(db, String(sorted[i].id));
            }
            roots = await listRootBlocks(db, budgetRecordId);
        }

        const figDupes = roots.filter((r) => r.type === "figures");
        if (figDupes.length > 1) {
            const sortedFig = [...figDupes].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
            for (let i = 1; i < sortedFig.length; i++) {
                await deleteBlockCascade(db, String(sortedFig[i].id));
            }
            roots = await listRootBlocks(db, budgetRecordId);
        }

        const hasCover = roots.some((r) => r.type === "cover");
        if (!hasCover) {
            return { success: true };
        }

        if (!roots.some((r) => r.type === "toc")) {
            createdTocOrFigures = true;
            await db.create(new Table("budget_block")).content({
                budget_id: budgetRecordId,
                type: "toc",
                label: "SUMÁRIO",
                order_index: 99999,
                props: {},
            });
            roots = await listRootBlocks(db, budgetRecordId);
        }

        if (!roots.some((r) => r.type === "figures")) {
            createdTocOrFigures = true;
            await db.create(new Table("budget_block")).content({
                budget_id: budgetRecordId,
                type: "figures",
                label: "LISTA DE FIGURAS",
                order_index: 100000,
                props: {},
            });
            roots = await listRootBlocks(db, budgetRecordId);
        }

        const cover = roots.find((r) => r.type === "cover");
        const headerFooter = roots.find((r) => r.type === "header_footer");
        const toc = roots.find((r) => r.type === "toc");
        const figures = roots.find((r) => r.type === "figures");
        if (!cover || !headerFooter || !toc || !figures) {
            return {
                success: false,
                error: "Não foi possível garantir capa, cabeçalho/rodapé, sumário e lista de figuras na raiz.",
            };
        }

        if (createdTocOrFigures) {
            await normalizeFixedRootOrder(db, budgetRecordId);
        }

        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("ensureCompositorTocBlockAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao garantir sumário" };
    }
}

/**
 * Garante um bloco `quote` na raiz (ORÇAMENTO).
 * Usado para permitir montagem integral no compositor com referência explícita à aba Orçamento.
 */
export async function ensureCompositorQuoteBlockAction(
    budgetId: string,
    options?: { skipRevalidate?: boolean }
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetInActiveTenant(budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const budgetRecordId = gate.budgetRecordId;
        const rootsRes = await db.query<[Array<{ id: unknown; order_index: number; type: string }>]>(
            "SELECT id, order_index, type FROM budget_block WHERE budget_id = $budgetId AND parent_id IS NONE AND deleted_at IS NONE ORDER BY order_index ASC",
            { budgetId: budgetRecordId }
        );
        let roots = rootsRes[0] || [];

        const quoteDupes = roots.filter((r) => r.type === "quote");
        if (quoteDupes.length > 1) {
            const sorted = [...quoteDupes].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
            for (let i = 1; i < sorted.length; i++) {
                await deleteBlockCascade(db, String(sorted[i].id));
            }
            const rootsDeduped = await db.query<[Array<{ id: unknown; order_index: number; type: string }>]>(
                "SELECT id, order_index, type FROM budget_block WHERE budget_id = $budgetId AND parent_id IS NONE AND deleted_at IS NONE ORDER BY order_index ASC",
                { budgetId: budgetRecordId }
            );
            roots = rootsDeduped[0] || [];
        }

        if (!roots.some((r) => r.type === "quote")) {
            await db.create(new Table("budget_block")).content({
                budget_id: budgetRecordId,
                type: "quote",
                label: "ORÇAMENTO",
                order_index: 99996,
                props: {},
            });
        }

        if (!options?.skipRevalidate) {
            revalidatePath(budgetRevalidatePath(budgetId));
        }
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("ensureCompositorQuoteBlockAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao garantir bloco de orçamento" };
    }
}

async function deleteBlockCascade(db: Awaited<ReturnType<typeof getDb>>, blockId: string) {
    const blockRecordId = requireRecordId("budget_block", blockId);

    const childrenRes = await db.query<[Array<{ id: string }>]>(
        "SELECT id FROM budget_block WHERE parent_id = $blockId AND deleted_at IS NONE",
        { blockId: blockRecordId }
    );
    const children = childrenRes[0] || [];

    for (const child of children) {
        await deleteBlockCascade(db, String(child.id));
    }

    await db.query(
        "UPDATE budget_item SET deleted_at = $now WHERE block_id = $blockId AND deleted_at IS NONE",
        { blockId: blockRecordId, now: new Date().toISOString() }
    );

    await db.update(blockRecordId).merge({ deleted_at: new Date().toISOString() });
}

export async function addBlockAction(params: {
    budgetId: string;
    parentId: string | null;
    type: string;
    label: string;
    props?: Record<string, unknown>;
}): Promise<{ success: boolean; blockId?: string; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetInActiveTenant(params.budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const { budgetId, parentId, type, label, props = {} } = params;
        if (type === "terms") {
            return { success: false, error: "A seção Condições Gerais foi removida do documento." };
        }

        if (parentId) {
            const parentGate = await assertBudgetChildInActiveTenant(
                "budget_block",
                parentId,
                budgetId,
                db
            );
            if (!parentGate.ok) return { success: false, error: parentGate.error };
        }

        const budgetRecordId = gate.budgetRecordId;

        let orderIndex = 0;
        try {
            const siblingsRes = await db.query<[Array<{ order_index: number }>]>(
                parentId
                    ? "SELECT order_index FROM budget_block WHERE parent_id = $parentId ORDER BY order_index DESC LIMIT 1"
                    : "SELECT order_index FROM budget_block WHERE budget_id = $budgetId AND parent_id IS NONE ORDER BY order_index DESC LIMIT 1",
                parentId
                    ? { parentId: requireRecordId("budget_block", parentId) }
                    : { budgetId: budgetRecordId }
            );
            const lastIndex = siblingsRes[0]?.[0]?.order_index ?? -1;
            orderIndex = lastIndex + 1;
        } catch {
            orderIndex = Date.now();
        }

        const initialProps = type === "session" && !parentId && props.page_break_before === undefined
            ? { ...props, page_break_before: false }
            : props;
        const raw = await db.create(new Table("budget_block")).content({
            budget_id: budgetRecordId,
            ...(parentId ? { parent_id: requireRecordId("budget_block", parentId) } : {}),
            type,
            label,
            order_index: orderIndex,
            props: sanitizeCompositorBlockPropsForPersistence(type, initialProps),
        });
        const created = Array.isArray(raw) ? raw[0] : raw;

        await auditTenantAction({
            action: "budget_block.create",
            resourceType: "budget_block",
            resourceId: String(created.id),
            summary: `Bloco ${type} adicionado ao compositor`,
            metadata: { budgetId, type, label },
        });
        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true, blockId: String(created.id) };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("addBlockAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao adicionar bloco" };
    }
}

export async function updateBlockAction(
    blockId: string,
    budgetId: string,
    patch: { label?: string; props?: Record<string, unknown> }
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetChildInActiveTenant("budget_block", blockId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const blockRecordId = requireRecordId("budget_block", blockId);

        if (patch.props !== undefined) {
            const current = await db.select(blockRecordId);
            const currentBlock = (Array.isArray(current) ? current[0] : current) as Record<string, unknown>;
            const blockType = String(currentBlock?.type ?? "");
            const mergedProps = sanitizeCompositorBlockPropsForPersistence(blockType, {
                ...((currentBlock?.props as Record<string, unknown>) ?? {}),
                ...patch.props,
            });
            await db.update(blockRecordId).merge({
                ...(patch.label !== undefined ? { label: patch.label } : {}),
                props: mergedProps,
            });
        } else {
            await db.update(blockRecordId).merge({
                ...(patch.label !== undefined ? { label: patch.label } : {}),
            });
        }

        await auditTenantAction({
            action: "budget_block.update",
            resourceType: "budget_block",
            resourceId: blockId,
            summary: "Bloco do compositor atualizado",
            metadata: { budgetId },
        });
        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("updateBlockAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao atualizar bloco" };
    }
}

export async function deleteBlockAction(
    blockId: string,
    budgetId: string
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetChildInActiveTenant("budget_block", blockId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const blockRecordId = requireRecordId("budget_block", blockId);
        const current = await db.select(blockRecordId);
        const row = (Array.isArray(current) ? current[0] : current) as { type?: string } | undefined;
        if (row?.type === "cover") {
            return { success: false, error: "A capa não pode ser removida — todo documento possui uma capa." };
        }
        if (row?.type === "toc") {
            return { success: false, error: "O sumário não pode ser removido — ele é gerado automaticamente após a capa." };
        }
        if (row?.type === "figures") {
            return {
                success: false,
                error: "A lista de figuras não pode ser removida — ela é gerada automaticamente pelo documento.",
            };
        }
        if (row?.type === "header_footer") {
            return {
                success: false,
                error: "O bloco Cabeçalho e Rodapé não pode ser removido — ele configura a paginação da proposta.",
            };
        }
        if (row?.type === "quote") {
            return {
                success: false,
                error: "O bloco Orçamento não pode ser removido — ele representa o detalhamento financeiro do documento.",
            };
        }

        await deleteBlockCascade(db, blockId);
        await auditTenantAction({
            action: "budget_block.delete",
            resourceType: "budget_block",
            resourceId: blockId,
            summary: "Bloco removido do compositor",
            metadata: { budgetId },
        });
        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("deleteBlockAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao remover bloco" };
    }
}

export async function moveBlockToParentAction(
    blockId: string,
    newParentId: string | null,
    budgetId: string
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetChildInActiveTenant("budget_block", blockId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const blockRecordId = requireRecordId("budget_block", blockId);
        const current = await db.select(blockRecordId);
        const row = (Array.isArray(current) ? current[0] : current) as { type?: string } | undefined;
        if (row?.type === "cover") {
            if (newParentId !== null) {
                return {
                    success: false,
                    error: "A capa deve permanecer na raiz do documento.",
                };
            }
        }
        if (row?.type === "toc") {
            if (newParentId !== null) {
                return {
                    success: false,
                    error: "O sumário deve permanecer na raiz do documento.",
                };
            }
        }
        if (row?.type === "figures") {
            if (newParentId !== null) {
                return {
                    success: false,
                    error: "A lista de figuras deve permanecer na raiz do documento.",
                };
            }
        }
        if (row?.type === "header_footer") {
            if (newParentId !== null) {
                return {
                    success: false,
                    error: "O bloco Cabeçalho e Rodapé deve permanecer na raiz do documento.",
                };
            }
        }
        if (row?.type === "quote") {
            if (newParentId !== null) {
                return {
                    success: false,
                    error: "O bloco Orçamento deve permanecer na raiz do documento.",
                };
            }
        }
        if (row?.type === "terms") {
            if (newParentId !== null) {
                return {
                    success: false,
                    error: "O bloco Condições Gerais deve permanecer na raiz do documento.",
                };
            }
        }
        if (newParentId) {
            if (row?.type === "scope") {
                return {
                    success: false,
                    error: "O bloco Detalhamento do projeto deve permanecer na raiz do documento.",
                };
            }
            await db.update(blockRecordId).merge({ parent_id: requireRecordId("budget_block", newParentId) });
        } else {
            await db.query("UPDATE $block SET parent_id = NONE", { block: blockRecordId });
        }
        await auditTenantAction({
            action: "budget_block.move",
            resourceType: "budget_block",
            resourceId: blockId,
            summary: "Bloco movido no compositor",
            metadata: { budgetId, newParentId },
        });
        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("moveBlockToParentAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao mover bloco" };
    }
}

export async function reorderBlocksAction(
    blockIds: string[],
    budgetId: string
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetInActiveTenant(budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const fixedOrder = ["cover", "header_footer"];
        const fixedPosByType = new Map<string, number>();
        for (let i = 0; i < blockIds.length; i++) {
            const row = await db.select(requireRecordId("budget_block", blockIds[i]));
            const block = (Array.isArray(row) ? row[0] : row) as { type?: string } | undefined;
            const t = String(block?.type ?? "");
            if (fixedOrder.includes(t)) fixedPosByType.set(t, i);
        }
        const fixedPositions = fixedOrder
            .map((t) => fixedPosByType.get(t))
            .filter((n): n is number => typeof n === "number");
        for (let i = 1; i < fixedPositions.length; i++) {
            if (fixedPositions[i] < fixedPositions[i - 1]) {
                return {
                    success: false,
                    error: "A ordem fixa CAPA → CABEÇALHO E RODAPÉ deve ser mantida.",
                };
            }
        }
        for (let i = 0; i < blockIds.length; i++) {
            await db.update(requireRecordId("budget_block", blockIds[i])).merge({ order_index: i });
        }
        await auditTenantAction({
            action: "budget_block.reorder",
            resourceType: "budget",
            resourceId: budgetId,
            summary: "Blocos reordenados no compositor",
            metadata: { count: blockIds.length },
        });
        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("reorderBlocksAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao reordenar blocos" };
    }
}

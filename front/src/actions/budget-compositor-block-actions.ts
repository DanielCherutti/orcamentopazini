"use server";

import { Table } from "surrealdb";
import { assertActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { revalidatePath } from "next/cache";
import { budgetRevalidatePath } from "@/lib/budgets/budget-path";
import { InvalidRecordIdError, requireRecordId } from "@/lib/surreal-record-ids";
import { mergeCoverDocumentProps } from "@/lib/budgets/cover-document";
import { sanitizeCompositorBlockPropsForPersistence } from "@/lib/pdf/sanitize-inline-styles-for-pdf";

/**
 * Garante um bloco `cover` na raiz (order_index 0) para orçamentos compositor.
 * Orçamentos antigos sem capa recebem o bloco na próxima carga da árvore.
 */
export async function ensureCompositorCoverBlockAction(
    budgetId: string
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const budgetRecordId = requireRecordId("budget", budgetId);

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
 * Garante blocos fixos na raiz (capa, sumário, lista de figuras).
 * A ordem padrão (capa → sumário → lista de figuras → escopo → demais) só é aplicada
 * quando um bloco sumário ou lista de figuras é criado nesta execução — não sobrescreve
 * reordenações feitas pelo usuário nas cargas seguintes.
 */
export async function ensureCompositorTocBlockAction(
    budgetId: string
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const budgetRecordId = requireRecordId("budget", budgetId);

        const rootsRes = await db.query<
            [Array<{ id: unknown; order_index: number; type: string }>]
        >(
            "SELECT id, order_index, type FROM budget_block WHERE budget_id = $budgetId AND parent_id IS NONE AND deleted_at IS NONE ORDER BY order_index ASC",
            { budgetId: budgetRecordId }
        );
        let roots = rootsRes[0] || [];
        let createdTocOrFigures = false;

        const tocDupes = roots.filter((r) => r.type === "toc");
        if (tocDupes.length > 1) {
            const sorted = [...tocDupes].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
            for (let i = 1; i < sorted.length; i++) {
                await deleteBlockCascade(db, String(sorted[i].id));
            }
            const rootsDeduped = await db.query<
                [Array<{ id: unknown; order_index: number; type: string }>]
            >(
                "SELECT id, order_index, type FROM budget_block WHERE budget_id = $budgetId AND parent_id IS NONE AND deleted_at IS NONE ORDER BY order_index ASC",
                { budgetId: budgetRecordId }
            );
            roots = rootsDeduped[0] || [];
        }

        const figDupes = roots.filter((r) => r.type === "figures");
        if (figDupes.length > 1) {
            const sortedFig = [...figDupes].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
            for (let i = 1; i < sortedFig.length; i++) {
                await deleteBlockCascade(db, String(sortedFig[i].id));
            }
            const rootsDedupedFig = await db.query<
                [Array<{ id: unknown; order_index: number; type: string }>]
            >(
                "SELECT id, order_index, type FROM budget_block WHERE budget_id = $budgetId AND parent_id IS NONE AND deleted_at IS NONE ORDER BY order_index ASC",
                { budgetId: budgetRecordId }
            );
            roots = rootsDedupedFig[0] || [];
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
            const rootsRes2 = await db.query<
                [Array<{ id: unknown; order_index: number; type: string }>]
            >(
                "SELECT id, order_index, type FROM budget_block WHERE budget_id = $budgetId AND parent_id IS NONE AND deleted_at IS NONE ORDER BY order_index ASC",
                { budgetId: budgetRecordId }
            );
            roots = rootsRes2[0] || [];
        }

        if (!roots.some((r) => r.type === "figures")) {
            createdTocOrFigures = true;
            await db.create(new Table("budget_block")).content({
                budget_id: budgetRecordId,
                type: "figures",
                label: "LISTA DE FIGURAS",
                order_index: 99997,
                props: {},
            });
            const rootsResFig = await db.query<
                [Array<{ id: unknown; order_index: number; type: string }>]
            >(
                "SELECT id, order_index, type FROM budget_block WHERE budget_id = $budgetId AND parent_id IS NONE AND deleted_at IS NONE ORDER BY order_index ASC",
                { budgetId: budgetRecordId }
            );
            roots = rootsResFig[0] || [];
        }

        const cover = roots.find((r) => r.type === "cover");
        const toc = roots.find((r) => r.type === "toc");
        const figures = roots.find((r) => r.type === "figures");
        if (!cover || !toc || !figures) {
            return {
                success: false,
                error: "Não foi possível garantir capa, sumário e lista de figuras na raiz.",
            };
        }

        if (createdTocOrFigures) {
            const rootsResNorm = await db.query<
                [Array<{ id: unknown; order_index: number; type: string }>]
            >(
                "SELECT id, order_index, type FROM budget_block WHERE budget_id = $budgetId AND parent_id IS NONE AND deleted_at IS NONE ORDER BY order_index ASC",
                { budgetId: budgetRecordId }
            );
            roots = rootsResNorm[0] || [];
            const scopeRow = roots.find((r) => r.type === "scope");
            const coverRow = roots.find((r) => r.type === "cover");
            const tocRow = roots.find((r) => r.type === "toc");
            const figuresRow = roots.find((r) => r.type === "figures");
            if (!coverRow || !tocRow || !figuresRow) {
                return {
                    success: false,
                    error: "Não foi possível normalizar ordem após criar sumário ou lista de figuras.",
                };
            }
            const othersSorted = roots
                .filter(
                    (r) =>
                        r.type !== "cover" &&
                        r.type !== "toc" &&
                        r.type !== "scope" &&
                        r.type !== "figures"
                )
                .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
            const ordered =
                scopeRow && coverRow && tocRow && figuresRow
                    ? [coverRow, tocRow, figuresRow, scopeRow, ...othersSorted]
                    : [coverRow, tocRow, figuresRow, ...othersSorted];
            for (let i = 0; i < ordered.length; i++) {
                await db.update(requireRecordId("budget_block", String(ordered[i].id))).merge({
                    order_index: i,
                });
            }
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
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const { budgetId, parentId, type, label, props = {} } = params;
        const budgetRecordId = requireRecordId("budget", budgetId);

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

        const raw = await db.create(new Table("budget_block")).content({
            budget_id: budgetRecordId,
            ...(parentId ? { parent_id: requireRecordId("budget_block", parentId) } : {}),
            type,
            label,
            order_index: orderIndex,
            props: sanitizeCompositorBlockPropsForPersistence(type, props),
        });
        const created = Array.isArray(raw) ? raw[0] : raw;

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
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

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
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

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
                error: "A lista de figuras não pode ser removida — ela é gerada automaticamente após o sumário.",
            };
        }

        await deleteBlockCascade(db, blockId);
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
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

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
        if (newParentId) {
            if (row?.type === "scope") {
                return {
                    success: false,
                    error: "O bloco Escopo deve permanecer na raiz do documento.",
                };
            }
            await db.update(blockRecordId).merge({ parent_id: requireRecordId("budget_block", newParentId) });
        } else {
            await db.query("UPDATE $block SET parent_id = NONE", { block: blockRecordId });
        }
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
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        for (let i = 0; i < blockIds.length; i++) {
            await db.update(requireRecordId("budget_block", blockIds[i])).merge({ order_index: i });
        }
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

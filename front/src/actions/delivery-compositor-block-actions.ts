"use server";

import { Table } from "surrealdb";
import { assertWriteActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { revalidatePath } from "next/cache";
import { deliveryProjectRevalidatePath } from "@/lib/delivery/delivery-path";
import {
    assertDeliveryBlockInActiveTenant,
    assertDeliveryProjectInActiveTenant,
} from "@/lib/delivery/delivery-compositor-tenant";
import { mergeCoverDocumentProps } from "@/lib/budgets/cover-document";
import { sanitizeCompositorBlockPropsForPersistence } from "@/lib/pdf/sanitize-inline-styles-for-pdf";
import { auditTenantAction } from "@/lib/audit-log";
import { InvalidRecordIdError, requireRecordId } from "@/lib/surreal-record-ids";
import { DEFAULT_HEADER_FOOTER_PROPS } from "@/types/budget-compositor-types";

const USER_ADDABLE_BLOCK_TYPES = new Set(["session", "text"]);
const PROTECTED_ROOT_TYPES = new Set(["cover", "header_footer", "toc"]);

type RootBlockRow = { id: unknown; order_index: number; type: string; props?: Record<string, unknown> };

async function listRootBlocks(
    db: Awaited<ReturnType<typeof getDb>>,
    projectRecordId: ReturnType<typeof requireRecordId>,
): Promise<RootBlockRow[]> {
    const rootsRes = await db.query<[RootBlockRow[]]>(
        `SELECT id, order_index, type, props FROM delivery_block
         WHERE delivery_project_id = $projectId AND parent_id IS NONE AND deleted_at IS NONE
         ORDER BY order_index ASC`,
        { projectId: projectRecordId },
    );
    return rootsRes[0] || [];
}

async function normalizeDeliveryRootOrder(
    db: Awaited<ReturnType<typeof getDb>>,
    projectRecordId: ReturnType<typeof requireRecordId>,
) {
    const roots = await listRootBlocks(db, projectRecordId);
    const cover = roots.find((r) => r.type === "cover");
    const headerFooter = roots.find((r) => r.type === "header_footer");
    const toc = roots.find((r) => r.type === "toc");
    if (!cover || !headerFooter || !toc) return;

    const othersSorted = roots
        .filter((r) => r.type !== "cover" && r.type !== "header_footer" && r.type !== "toc")
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

    const ordered = [cover, headerFooter, toc, ...othersSorted];
    for (let i = 0; i < ordered.length; i++) {
        await db.update(requireRecordId("delivery_block", String(ordered[i].id))).merge({
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
        inner_use_cover_watermark: innerWm.trim().length === 0,
        inner_watermark_url: innerWm,
        inner_watermark_opacity: Number(c.document_watermark_opacity ?? 0.06),
        legacy_cover_pdf_show_header_band: c.cover_pdf_show_header_band !== false,
        legacy_cover_pdf_show_footer_band: c.cover_pdf_show_footer_band !== false,
        legacy_cover_pdf_header_company_override: String(c.cover_pdf_header_company_override ?? ""),
        legacy_cover_pdf_header_logo_url_override: String(c.cover_pdf_header_logo_url_override ?? ""),
        legacy_cover_pdf_footer_left_template: String(c.cover_pdf_footer_left_template ?? ""),
        legacy_cover_pdf_footer_right_template: String(c.cover_pdf_footer_right_template ?? ""),
    };
}

async function deleteBlockCascade(db: Awaited<ReturnType<typeof getDb>>, blockId: string) {
    const blockRecordId = requireRecordId("delivery_block", blockId);
    const childrenRes = await db.query<[Array<{ id: string }>]>(
        `SELECT id FROM delivery_block WHERE parent_id = $blockId AND deleted_at IS NONE`,
        { blockId: blockRecordId },
    );
    for (const child of childrenRes[0] || []) {
        await deleteBlockCascade(db, String(child.id));
    }
    await db.update(blockRecordId).merge({ deleted_at: new Date().toISOString() });
}

export async function ensureDeliveryCompositorCoverBlockAction(
    projectId: string,
    options?: { skipRevalidate?: boolean },
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertDeliveryProjectInActiveTenant(projectId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const projectRecordId = gate.projectRecordId;
        const roots = await listRootBlocks(db, projectRecordId);
        if (roots.some((r) => r.type === "cover")) return { success: true };

        for (const r of roots) {
            await db
                .update(requireRecordId("delivery_block", String(r.id)))
                .merge({ order_index: (r.order_index ?? 0) + 1 });
        }

        await db.create(new Table("delivery_block")).content({
            delivery_project_id: projectRecordId,
            type: "cover",
            label: "CAPA",
            order_index: 0,
            props: mergeCoverDocumentProps({
                main_title: "MEMORIAL DE ENTREGA TÉCNICA",
                subtitle: "Documentação de instalação e adequação",
            }) as Record<string, unknown>,
        });

        if (!options?.skipRevalidate) {
            revalidatePath(deliveryProjectRevalidatePath(projectId));
        }
        return { success: true };
    } catch (error) {
        console.error("ensureDeliveryCompositorCoverBlockAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao garantir capa do DataBook" };
    }
}

export async function ensureDeliveryCompositorHeaderFooterBlockAction(
    projectId: string,
    options?: { skipRevalidate?: boolean },
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertDeliveryProjectInActiveTenant(projectId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const projectRecordId = gate.projectRecordId;
        let roots = await listRootBlocks(db, projectRecordId);

        const dupes = roots.filter((r) => r.type === "header_footer");
        if (dupes.length > 1) {
            const sorted = [...dupes].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
            for (let i = 1; i < sorted.length; i++) {
                await deleteBlockCascade(db, String(sorted[i].id));
            }
            roots = await listRootBlocks(db, projectRecordId);
        }

        if (!roots.some((r) => r.type === "header_footer")) {
            const coverRow = roots.find((r) => r.type === "cover");
            await db.create(new Table("delivery_block")).content({
                delivery_project_id: projectRecordId,
                type: "header_footer",
                label: "CABEÇALHO E RODAPÉ",
                order_index: 99998,
                props: headerFooterLegacyPropsFromCover(coverRow?.props),
            });
            await normalizeDeliveryRootOrder(db, projectRecordId);
        }

        if (!options?.skipRevalidate) {
            revalidatePath(deliveryProjectRevalidatePath(projectId));
        }
        return { success: true };
    } catch (error) {
        console.error("ensureDeliveryCompositorHeaderFooterBlockAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao garantir cabeçalho/rodapé" };
    }
}

export async function ensureDeliveryCompositorTocBlockAction(
    projectId: string,
    options?: { skipRevalidate?: boolean },
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertDeliveryProjectInActiveTenant(projectId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const projectRecordId = gate.projectRecordId;
        const roots = await listRootBlocks(db, projectRecordId);
        if (!roots.some((r) => r.type === "cover")) return { success: true };

        if (!roots.some((r) => r.type === "toc")) {
            await db.create(new Table("delivery_block")).content({
                delivery_project_id: projectRecordId,
                type: "toc",
                label: "SUMÁRIO",
                order_index: 99999,
                props: {},
            });
            await normalizeDeliveryRootOrder(db, projectRecordId);
        }

        if (!options?.skipRevalidate) {
            revalidatePath(deliveryProjectRevalidatePath(projectId));
        }
        return { success: true };
    } catch (error) {
        console.error("ensureDeliveryCompositorTocBlockAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao garantir sumário" };
    }
}

export async function seedDeliveryCompositorBlocksAction(projectId: string) {
    await ensureDeliveryCompositorCoverBlockAction(projectId, { skipRevalidate: true });
    await ensureDeliveryCompositorHeaderFooterBlockAction(projectId, { skipRevalidate: true });
    await ensureDeliveryCompositorTocBlockAction(projectId, { skipRevalidate: true });
}

export async function addDeliveryBlockAction(params: {
    projectId: string;
    parentId: string | null;
    type: string;
    label: string;
    props?: Record<string, unknown>;
}): Promise<{ success: boolean; blockId?: string; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertDeliveryProjectInActiveTenant(params.projectId);
    if (!gate.ok) return { success: false, error: gate.error };

    const { projectId, parentId, type, label, props = {} } = params;
    if (!USER_ADDABLE_BLOCK_TYPES.has(type) && !parentId) {
        return { success: false, error: "Tipo de bloco não permitido neste documento." };
    }
    if (["quote", "scope", "figures", "location", "section", "terms"].includes(type)) {
        return { success: false, error: "Este tipo de bloco não faz parte do DataBook de entrega." };
    }

    const db = await getDb();
    try {
        if (parentId) {
            const parentGate = await assertDeliveryBlockInActiveTenant(parentId, projectId, db);
            if (!parentGate.ok) return { success: false, error: parentGate.error };
        }

        const projectRecordId = gate.projectRecordId;
        const siblingsRes = await db.query<[Array<{ order_index: number }>]>(
            parentId
                ? `SELECT order_index FROM delivery_block WHERE parent_id = $parentId ORDER BY order_index DESC LIMIT 1`
                : `SELECT order_index FROM delivery_block WHERE delivery_project_id = $projectId AND parent_id IS NONE ORDER BY order_index DESC LIMIT 1`,
            parentId
                ? { parentId: requireRecordId("delivery_block", parentId) }
                : { projectId: projectRecordId },
        );
        const orderIndex = (siblingsRes[0]?.[0]?.order_index ?? -1) + 1;

        const raw = await db.create(new Table("delivery_block")).content({
            delivery_project_id: projectRecordId,
            ...(parentId ? { parent_id: requireRecordId("delivery_block", parentId) } : {}),
            type,
            label,
            order_index: orderIndex,
            props: sanitizeCompositorBlockPropsForPersistence(type, props),
        });
        const created = Array.isArray(raw) ? raw[0] : raw;

        await auditTenantAction({
            action: "delivery_block.create",
            resourceType: "delivery_block",
            resourceId: String((created as Record<string, unknown>).id),
            summary: `Bloco ${type} adicionado ao DataBook`,
            metadata: { projectId, type, label },
        });
        revalidatePath(deliveryProjectRevalidatePath(projectId));
        return { success: true, blockId: String((created as Record<string, unknown>).id) };
    } catch (error) {
        console.error("addDeliveryBlockAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao adicionar bloco" };
    }
}

export async function updateDeliveryBlockAction(
    blockId: string,
    projectId: string,
    patch: { label?: string; props?: Record<string, unknown> },
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertDeliveryBlockInActiveTenant(blockId, projectId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const blockRecordId = requireRecordId("delivery_block", blockId);
        if (patch.props !== undefined) {
            const current = await db.select(blockRecordId);
            const currentBlock = (Array.isArray(current) ? current[0] : current) as Record<
                string,
                unknown
            >;
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

        revalidatePath(deliveryProjectRevalidatePath(projectId));
        return { success: true };
    } catch (error) {
        console.error("updateDeliveryBlockAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao atualizar bloco" };
    }
}

export async function deleteDeliveryBlockAction(
    blockId: string,
    projectId: string,
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertDeliveryBlockInActiveTenant(blockId, projectId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const blockRecordId = requireRecordId("delivery_block", blockId);
        const current = await db.select(blockRecordId);
        const row = (Array.isArray(current) ? current[0] : current) as { type?: string } | undefined;
        if (row?.type && PROTECTED_ROOT_TYPES.has(row.type)) {
            return { success: false, error: "Este bloco fixo não pode ser removido." };
        }

        await deleteBlockCascade(db, blockId);
        revalidatePath(deliveryProjectRevalidatePath(projectId));
        return { success: true };
    } catch (error) {
        console.error("deleteDeliveryBlockAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao remover bloco" };
    }
}

export async function moveDeliveryBlockToParentAction(
    blockId: string,
    newParentId: string | null,
    projectId: string,
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertDeliveryBlockInActiveTenant(blockId, projectId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const blockRecordId = requireRecordId("delivery_block", blockId);
        const current = await db.select(blockRecordId);
        const row = (Array.isArray(current) ? current[0] : current) as { type?: string } | undefined;
        if (row?.type && PROTECTED_ROOT_TYPES.has(row.type)) {
            return { success: false, error: "Blocos fixos não podem ser movidos." };
        }

        if (newParentId) {
            const parentGate = await assertDeliveryBlockInActiveTenant(newParentId, projectId, db);
            if (!parentGate.ok) return { success: false, error: parentGate.error };
        }

        await db.update(blockRecordId).merge({
            parent_id: newParentId ? requireRecordId("delivery_block", newParentId) : null,
        });
        revalidatePath(deliveryProjectRevalidatePath(projectId));
        return { success: true };
    } catch (error) {
        console.error("moveDeliveryBlockToParentAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao mover bloco" };
    }
}

export async function reorderDeliveryBlocksAction(
    projectId: string,
    orderedBlockIds: string[],
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertDeliveryProjectInActiveTenant(projectId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        for (let i = 0; i < orderedBlockIds.length; i++) {
            const blockGate = await assertDeliveryBlockInActiveTenant(
                orderedBlockIds[i],
                projectId,
                db,
            );
            if (!blockGate.ok) return { success: false, error: blockGate.error };
            await db
                .update(requireRecordId("delivery_block", orderedBlockIds[i]))
                .merge({ order_index: i });
        }
        revalidatePath(deliveryProjectRevalidatePath(projectId));
        return { success: true };
    } catch (error) {
        console.error("reorderDeliveryBlocksAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao reordenar blocos" };
    }
}

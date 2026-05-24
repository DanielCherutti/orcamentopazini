import { Table, StringRecordId } from "surrealdb";
import { buildDuplicatedBudgetItemContent } from "@/actions/budget-hierarchy-helpers";

type BudgetDb = Awaited<ReturnType<typeof import("@/lib/surreal").getDb>>;

export type BudgetDuplicationMaps = {
    location: Map<string, StringRecordId>;
    section: Map<string, StringRecordId>;
    block: Map<string, StringRecordId>;
    item: Map<string, StringRecordId>;
};

export function createBudgetDuplicationMaps(): BudgetDuplicationMaps {
    return {
        location: new Map(),
        section: new Map(),
        block: new Map(),
        item: new Map(),
    };
}

async function duplicateImageAnnotations(
    db: BudgetDb,
    origImageRecordId: StringRecordId,
    newImageRecordId: StringRecordId,
    itemMap: Map<string, StringRecordId>
) {
    const annRes = await db.query<[Array<Record<string, unknown>>]>(
        "SELECT * FROM image_annotation WHERE image_id = $imageId",
        { imageId: origImageRecordId }
    );
    const annotations = annRes[0] || [];

    for (const ann of annotations) {
        const record: Record<string, unknown> = {
            image_id: newImageRecordId,
            tool_type: ann.tool_type,
            style: ann.style ?? {},
            geometry: ann.geometry ?? {},
            content: ann.content,
            created_at: new Date(),
        };

        const linkedOld = ann.linked_item_id ? String(ann.linked_item_id) : null;
        if (linkedOld && itemMap.has(linkedOld)) {
            record.linked_item_id = itemMap.get(linkedOld);
        }

        if (ann.fontColor != null) record.fontColor = ann.fontColor;
        if (ann.strokeColor != null) record.strokeColor = ann.strokeColor;
        if (ann.textStrokeWidth != null) record.textStrokeWidth = ann.textStrokeWidth;
        if (ann.borderColor != null) record.borderColor = ann.borderColor;
        if (ann.lineStyle != null) record.lineStyle = ann.lineStyle;
        if (ann.lineStrokeWidth != null) record.lineStrokeWidth = ann.lineStrokeWidth;

        await db.create(new Table("image_annotation")).content(record);
    }
}

/** Copia `budget_image` e `image_annotation` remapeando locais, trechos, blocos e itens. */
export async function duplicateBudgetImages(
    db: BudgetDb,
    originalBudgetRecordId: StringRecordId,
    newBudgetRecordId: StringRecordId,
    maps: BudgetDuplicationMaps
) {
    const imagesRes = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM budget_image
         WHERE budget_id = $budgetId AND deleted_at IS NONE
         ORDER BY order_index ASC, created_at ASC`,
        { budgetId: originalBudgetRecordId }
    );
    const images = imagesRes[0] || [];

    for (const img of images) {
        const locKey = img.location_id ? String(img.location_id) : null;
        const secKey = img.section_id ? String(img.section_id) : null;
        const blockKey = img.block_id ? String(img.block_id) : null;

        const content: Record<string, unknown> = {
            budget_id: newBudgetRecordId,
            url: img.url,
            width: img.width,
            height: img.height,
            order_index: img.order_index ?? Date.now(),
            created_at: new Date().toISOString(),
        };

        if (img.composed_url) content.composed_url = img.composed_url;
        if (img.caption) content.caption = img.caption;
        if (img.editor_viewport != null) content.editor_viewport = img.editor_viewport;
        if (img.figure_frame_orientation) {
            content.figure_frame_orientation = img.figure_frame_orientation;
        }

        if (blockKey) {
            const mapped = maps.block.get(blockKey);
            if (!mapped) continue;
            content.block_id = mapped;
        } else if (secKey) {
            const mapped = maps.section.get(secKey);
            if (!mapped) continue;
            content.section_id = mapped;
        } else if (locKey) {
            const mapped = maps.location.get(locKey);
            if (!mapped) continue;
            content.location_id = mapped;
        } else {
            continue;
        }

        const newImageRaw = await db.create(new Table("budget_image")).content(content);
        const newImage = Array.isArray(newImageRaw) ? newImageRaw[0] : newImageRaw;
        const newImageRecordId = new StringRecordId(String(newImage.id));
        const origImageRecordId = new StringRecordId(String(img.id));

        await duplicateImageAnnotations(db, origImageRecordId, newImageRecordId, maps.item);
    }
}

/** Copia compositor, adequações e imagens (uso em duplicar / revisão). */
export async function duplicateBudgetStructure(
    db: BudgetDb,
    originalBudgetRecordId: StringRecordId,
    newBudgetRecordId: StringRecordId,
    useCompositor: boolean
) {
    const maps = createBudgetDuplicationMaps();
    if (useCompositor) {
        await duplicateCompositorBlocks(db, originalBudgetRecordId, newBudgetRecordId, maps);
    }
    await duplicateBudgetScopeHierarchy(db, originalBudgetRecordId, newBudgetRecordId, maps);
    await duplicateBudgetImages(db, originalBudgetRecordId, newBudgetRecordId, maps);
}

/** Copia árvore de blocos do compositor e itens (uso interno em duplicateBudget). */
export async function duplicateCompositorBlocks(
    db: BudgetDb,
    originalBudgetRecordId: StringRecordId,
    newBudgetRecordId: StringRecordId,
    maps: BudgetDuplicationMaps = createBudgetDuplicationMaps()
) {
    const blocksRes = await db.query<[Array<Record<string, unknown>>]>(
        "SELECT * FROM budget_block WHERE budget_id = $budgetId ORDER BY order_index ASC",
        { budgetId: originalBudgetRecordId }
    );
    const flatBlocks = blocksRes[0] || [];
    if (flatBlocks.length === 0) return;

    const oldToNew = maps.block;

    const pending = [...flatBlocks];
    let maxPasses = pending.length + 1;

    while (pending.length > 0 && maxPasses-- > 0) {
        const batch: typeof pending = [];
        const remaining: typeof pending = [];

        for (const block of pending) {
            const origParentId = block.parent_id ? String(block.parent_id) : null;
            if (!origParentId || oldToNew.has(origParentId)) {
                batch.push(block);
            } else {
                remaining.push(block);
            }
        }

        for (const block of batch) {
            const origParentId = block.parent_id ? String(block.parent_id) : null;
            const newParentRecordId = origParentId ? oldToNew.get(origParentId) : undefined;

            const newBlockRaw = await db.create(new Table("budget_block")).content({
                budget_id: newBudgetRecordId,
                ...(newParentRecordId ? { parent_id: newParentRecordId } : {}),
                type: block.type,
                label: block.label,
                order_index: block.order_index,
                props: block.props ?? {},
            });
            const newBlock = Array.isArray(newBlockRaw) ? newBlockRaw[0] : newBlockRaw;
            oldToNew.set(String(block.id), new StringRecordId(String(newBlock.id)));
        }

        pending.splice(0, pending.length, ...remaining);
    }

    for (const [origBlockId, newBlockRecordId] of oldToNew.entries()) {
        const origBlockRecordId = new StringRecordId(origBlockId);
        const itemsRes = await db.query<[Array<Record<string, unknown>>]>(
            "SELECT * FROM budget_item WHERE block_id = $blockId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC",
            { blockId: origBlockRecordId }
        );
        const items = itemsRes[0] || [];
        for (const item of items) {
            const newItemRaw = await db.create(new Table("budget_item")).content({
                ...buildDuplicatedBudgetItemContent(item),
                block_id: newBlockRecordId,
                budget_id: newBudgetRecordId,
            });
            const newItem = Array.isArray(newItemRaw) ? newItemRaw[0] : newItemRaw;
            maps.item.set(String(item.id), new StringRecordId(String(newItem.id)));
        }
    }
}

/** Copia locais, trechos e itens por `section_id` (Adequações). */
export async function duplicateBudgetScopeHierarchy(
    db: BudgetDb,
    originalBudgetRecordId: StringRecordId,
    newBudgetRecordId: StringRecordId,
    maps: BudgetDuplicationMaps = createBudgetDuplicationMaps()
) {
    const locationsRes = await db.query<[Array<Record<string, unknown>>]>(
        "SELECT * FROM budget_location WHERE budget_id = $budgetId ORDER BY created_at ASC",
        { budgetId: originalBudgetRecordId }
    );
    const locations = locationsRes?.[0] || [];

    for (const loc of locations) {
        const newLocRaw = await db.create(new Table("budget_location")).content({
            budget_id: newBudgetRecordId,
            name: loc.name,
            description: loc.description,
            order_index: loc.order_index,
            show_costs_on_print: Boolean(loc.show_costs_on_print),
            costs_display_mode:
                loc.costs_display_mode === "location" || loc.costs_display_mode === "general"
                    ? loc.costs_display_mode
                    : "section",
            price_adjustment_enabled: Boolean(loc.price_adjustment_enabled),
            price_adjustment_input_mode:
                loc.price_adjustment_input_mode === "percent" ? "percent" : "fixed",
            assembly_mode: loc.assembly_mode ?? "percent",
            assembly_value: Number(loc.assembly_value ?? 0),
            created_at: new Date().toISOString(),
        });
        const newLoc = Array.isArray(newLocRaw) ? newLocRaw[0] : newLocRaw;
        const newLocId = String(newLoc.id);
        const newLocRecordId = new StringRecordId(newLocId);
        const origLocId = String(loc.id);
        maps.location.set(origLocId, newLocRecordId);
        const origLocRecordId = new StringRecordId(origLocId);

        const sectionsRes = await db.query<[Array<Record<string, unknown>>]>(
            "SELECT * FROM budget_section WHERE location_id = $locId ORDER BY created_at ASC",
            { locId: origLocRecordId }
        );
        const sections = sectionsRes?.[0] || [];

        for (const sec of sections) {
            const newSecRaw = await db.create(new Table("budget_section")).content({
                location_id: newLocRecordId,
                budget_id: newBudgetRecordId,
                name: sec.name,
                description: sec.description,
                order_index: sec.order_index,
                show_costs_on_print: Boolean(sec.show_costs_on_print),
                costs_display_mode:
                    sec.costs_display_mode === "location" || sec.costs_display_mode === "general"
                        ? sec.costs_display_mode
                        : "section",
                price_adjustment_enabled: Boolean(sec.price_adjustment_enabled),
                price_adjustment_input_mode:
                    sec.price_adjustment_input_mode === "percent" ? "percent" : "fixed",
                assembly_mode:
                    sec.assembly_mode === "fixed" || sec.assembly_mode === "manual"
                        ? sec.assembly_mode
                        : "percent",
                assembly_value: Number(sec.assembly_value ?? 0),
                created_at: new Date().toISOString(),
            });
            const newSec = Array.isArray(newSecRaw) ? newSecRaw[0] : newSecRaw;
            const newSecId = String(newSec.id);
            const origSecId = String(sec.id);
            maps.section.set(origSecId, new StringRecordId(newSecId));
            const origSecRecordId = new StringRecordId(origSecId);

            const itemsRes = await db.query<[Array<Record<string, unknown>>]>(
                "SELECT * FROM budget_item WHERE section_id = $secId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC",
                { secId: origSecRecordId }
            );
            const items = itemsRes?.[0] || [];
            for (const item of items) {
                const newItemRaw = await db.create(new Table("budget_item")).content({
                    ...buildDuplicatedBudgetItemContent(item as Record<string, unknown>),
                    section_id: new StringRecordId(newSecId),
                    budget_id: newBudgetRecordId,
                });
                const newItem = Array.isArray(newItemRaw) ? newItemRaw[0] : newItemRaw;
                maps.item.set(String(item.id), new StringRecordId(String(newItem.id)));
            }
        }
    }
}

/** Atualiza rótulo de revisão na capa do compositor (PDF). */
export async function updateCoverRevisionLabel(
    db: BudgetDb,
    budgetRecordId: StringRecordId,
    revisionLabel: string
) {
    const coverRes = await db.query<[Array<Record<string, unknown>>]>(
        "SELECT * FROM budget_block WHERE budget_id = $budgetId AND type = 'cover' LIMIT 1",
        { budgetId: budgetRecordId }
    );
    const cover = coverRes?.[0]?.[0];
    if (!cover?.id) return;

    const props =
        cover.props && typeof cover.props === "object" && !Array.isArray(cover.props)
            ? { ...(cover.props as Record<string, unknown>) }
            : {};
    props.revision_label = revisionLabel;

    await db.update(new StringRecordId(String(cover.id))).merge({ props });
}

export async function recalculateBudgetTotalValue(
    db: BudgetDb,
    budgetRecordId: StringRecordId,
    useCompositor: boolean
) {
    const totalRes = useCompositor
        ? await db.query<[{ grand_total: number }[]]>(
              "SELECT math::sum(total) as grand_total FROM budget_item WHERE block_id.budget_id = $budgetId GROUP ALL",
              { budgetId: budgetRecordId }
          )
        : await db.query<[{ grand_total: number }[]]>(
              "SELECT math::sum(total) as grand_total FROM budget_item WHERE section_id.budget_id = $budgetId GROUP ALL",
              { budgetId: budgetRecordId }
          );
    const grandTotal = totalRes[0]?.[0]?.grand_total || 0;
    await db.update(budgetRecordId).merge({ total_value: grandTotal });
}

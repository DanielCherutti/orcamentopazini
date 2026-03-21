"use server";

import { assertActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { Table } from "surrealdb";
import { revalidatePath } from "next/cache";
import { budgetRevalidatePath } from "@/lib/budgets/budget-path";
import { InvalidRecordIdError, requireRecordId } from "@/lib/surreal-record-ids";
import { TOOL_CONFIG } from "@/components/annotator/tools/types";
import type { ImageAnnotation, ArrowAnnotation, RectAnnotation, StickerAnnotation, TextAnnotation, PolylineAnnotation } from "@/components/annotator/tools/types";

import type { Surreal } from "surrealdb";

// Tipos para as actions
export interface SaveBudgetImageParams {
    budgetId: string;
    sectionId?: string;
    locationId?: string;
    blockId?: string;   // compositor: referência ao budget_block
    imageId?: string; // Se presente, atualiza em vez de criar
    url: string;
    composedUrl?: string; // Imagem com anotações "queimadas" (flattened)
    width: number;
    height: number;
    annotations: ImageAnnotation[];
}

interface DbImage {
    id: string;
    [key: string]: unknown;
}

function deserializeAnnotation(row: Record<string, unknown>): ImageAnnotation | null {
    const geometry = (row.geometry as Record<string, unknown>) ?? {};
    const id = String(row.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const style = row.style as any;
    const linked_item_id = row.linked_item_id as string | undefined;
    const content = row.content as string | undefined;

    switch (row.tool_type) {
        case 'arrow':
            return {
                id, tool_type: 'arrow', style, linked_item_id, content,
                points: (geometry.points ?? []) as ArrowAnnotation['points'],
                pointerLength: TOOL_CONFIG.arrow.pointerLength,
                pointerWidth: TOOL_CONFIG.arrow.pointerWidth,
            };
        case 'rect':
            return {
                id, tool_type: 'rect', style, linked_item_id, content,
                position: { x: Number(geometry.x), y: Number(geometry.y) },
                width: Number(geometry.width),
                height: Number(geometry.height),
            } as RectAnnotation;
        case 'step_number':
            return {
                id, tool_type: 'step_number', style, linked_item_id, content,
                position: { x: Number(geometry.x), y: Number(geometry.y) },
                number: parseInt(content ?? '0') || 0,
                radius: TOOL_CONFIG.step_number.radius,
            };
        case 'text':
            return {
                id, tool_type: 'text', style, linked_item_id,
                position: { x: Number(geometry.x), y: Number(geometry.y) },
                content: content ?? '',
                fontSize: geometry.fontSize != null ? Number(geometry.fontSize) : 14,
                width: geometry.width != null ? Number(geometry.width) : 200,
                height: geometry.height != null ? Number(geometry.height) : undefined,
                padding: geometry.padding != null ? Number(geometry.padding) : 8,
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                fontColor: row.fontColor as string | undefined,
                strokeColor: row.strokeColor as string | undefined,
                textStrokeWidth: row.textStrokeWidth != null ? Number(row.textStrokeWidth) : undefined,
                borderColor: row.borderColor as string | undefined,
            };
        case 'product_sticker':
            return {
                id, tool_type: 'product_sticker', style, linked_item_id, content,
                position: { x: Number(geometry.x), y: Number(geometry.y) },
                image_url: geometry.image_url as string | undefined,
                product_name: geometry.product_name as string | undefined,
                width: Number(geometry.width),
                height: Number(geometry.height),
                rotation: geometry.rotation as number | undefined,
                scaleX: geometry.scaleX as number | undefined,
                scaleY: geometry.scaleY as number | undefined,
            } as StickerAnnotation;
        case 'polyline':
            return {
                id, tool_type: 'polyline', style, linked_item_id, content,
                points: (geometry.points ?? []) as PolylineAnnotation['points'],
                lineStyle: (row.lineStyle as 'solid' | 'dashed' | 'dotted') ?? 'solid',
                strokeWidth: row.lineStrokeWidth != null ? Number(row.lineStrokeWidth) : 2,
            } as PolylineAnnotation;
        default:
            return null;
    }
}

async function fetchAnnotationsForImages(db: Surreal, images: DbImage[]) {
    return Promise.all(images.map(async (img) => {
        // img.id pode ser um RecordId object — garantir StringRecordId para bater
        // com o valor gravado em image_annotation.image_id (RecordId)
        const imgIdStr = String(img.id);
        const imgRecordId = requireRecordId("budget_image", imgIdStr);
        const [rows] = await db.query<[Record<string, unknown>[]]>(`
            SELECT * FROM image_annotation
            WHERE image_id = $imageId
        `, { imageId: imgRecordId });
        const annotations = (rows ?? []).map(deserializeAnnotation).filter(Boolean) as ImageAnnotation[];
        // toPlain converte RecordId/DateTime para strings simples (necessário para Client Components)
        return toPlain({
            ...img,
            id: imgIdStr,
            budget_id: img.budget_id ? String(img.budget_id) : img.budget_id,
            section_id: img.section_id ? String(img.section_id) : img.section_id,
            location_id: img.location_id ? String(img.location_id) : img.location_id,
            block_id: img.block_id ? String(img.block_id) : img.block_id,
            annotations,
        });
    }));
}

export async function saveBudgetImageWithAnnotations(params: SaveBudgetImageParams) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();

    const hasSection = !!params.sectionId;
    const hasLocation = !!params.locationId;
    const hasBlock = !!params.blockId;
    // Aceita: blockId sozinho (compositor) OU exatamente um de sectionId/locationId (legado)
    if (!hasBlock && hasSection === hasLocation) {
        return { success: false, error: "Exatamente um de sectionId, locationId ou blockId deve ser preenchido" };
    }

    try {
        let imageId: string;
        let image: DbImage;

        const budgetRecordId = requireRecordId("budget", params.budgetId);
        const sectionRecordId = params.sectionId ? requireRecordId("budget_section", params.sectionId) : null;
        const locationRecordId = params.locationId ? requireRecordId("budget_location", params.locationId) : null;
        const blockRecordId = params.blockId ? requireRecordId("budget_block", params.blockId) : null;

        if (params.imageId) {
            // Modo atualização: deletar anotações antigas e atualizar imagem
            const imageRecordId = requireRecordId("budget_image", params.imageId);
            const [existing] = await db.query<[DbImage[]]>(
                "SELECT * FROM budget_image WHERE id = $imageId AND budget_id = $budgetId",
                { imageId: imageRecordId, budgetId: budgetRecordId }
            );
            if (!existing?.[0]) {
                return { success: false, error: "Imagem não encontrada ou não pertence ao orçamento" };
            }

            await db.query("DELETE image_annotation WHERE image_id = $imageId", { imageId: imageRecordId });
            await db.update(requireRecordId("budget_image", params.imageId)).merge({
                url: params.url,
                composed_url: params.composedUrl,
                width: params.width,
                height: params.height,
                section_id: sectionRecordId,
                location_id: locationRecordId,
                ...(blockRecordId !== null ? { block_id: blockRecordId } : {}),
            });
            imageId = params.imageId;
            image = { id: imageId };
        } else {
            // order_index: usa Date.now() como sequência única — evita query math::max()
            // que falha com "Expected a array but found 0" quando não há imagens ainda.
            const nextOrder = Date.now();

            const rawCreated = await db.create(new Table("budget_image")).content({
                budget_id: budgetRecordId,
                section_id: sectionRecordId,
                location_id: locationRecordId,
                ...(blockRecordId !== null ? { block_id: blockRecordId } : {}),
                url: params.url,
                composed_url: params.composedUrl,
                width: params.width,
                height: params.height,
                order_index: nextOrder,
                created_at: new Date()
            });
            // surrealdb.js pode retornar array ou objeto — normaliza para objeto
            const created = Array.isArray(rawCreated) ? rawCreated[0] : rawCreated;

            if (!created) throw new Error("Falha ao criar registro da imagem no SurrealDB");
            image = { ...created, id: String(created.id) };
            imageId = image.id;
        }

        // Criar registros das anotações
        if (params.annotations && params.annotations.length > 0) {
            const buildGeometry = (ann: ImageAnnotation): Record<string, unknown> => {
                switch (ann.tool_type) {
                    case 'arrow': {
                        const a = ann as ArrowAnnotation;
                        return { points: a.points };
                    }
                    case 'polyline': {
                        const a = ann as PolylineAnnotation;
                        return { points: a.points };
                    }
                    case 'rect': {
                        const a = ann as RectAnnotation;
                        return { x: a.position.x, y: a.position.y, width: a.width, height: a.height };
                    }
                    case 'product_sticker': {
                        const a = ann as StickerAnnotation;
                        return {
                            x: a.position.x, y: a.position.y,
                            width: a.width, height: a.height,
                            image_url: a.image_url, product_name: a.product_name,
                            rotation: a.rotation, scaleX: a.scaleX, scaleY: a.scaleY,
                        };
                    }
                    case 'text': {
                        const a = ann as TextAnnotation;
                        return { x: a.position.x, y: a.position.y, width: a.width, height: a.height, fontSize: a.fontSize, padding: a.padding };
                    }
                    default: {
                        // step_number
                        const pos = 'position' in ann ? ann.position : undefined;
                        return { x: pos?.x, y: pos?.y };
                    }
                }
            };

            const imageIdRecord = requireRecordId("budget_image", imageId);
            const annotationPromises = params.annotations.map(ann => {
                const content = ann.tool_type === 'step_number' ? String(ann.number) : ann.content;
                const record: Record<string, unknown> = {
                    image_id: imageIdRecord,
                    tool_type: ann.tool_type,
                    style: ann.style,
                    geometry: buildGeometry(ann),
                    content,
                    linked_item_id: ann.linked_item_id,
                    created_at: new Date()
                };
                // Campos opcionais de estilo de texto (somente TextAnnotation)
                if (ann.tool_type === 'text') {
                    const textAnn = ann as TextAnnotation;
                    if (textAnn.fontColor) record.fontColor = textAnn.fontColor;
                    if (textAnn.strokeColor) record.strokeColor = textAnn.strokeColor;
                    if (textAnn.textStrokeWidth) record.textStrokeWidth = textAnn.textStrokeWidth;
                    if (textAnn.borderColor) record.borderColor = textAnn.borderColor;
                }
                // Campos extras de polyline
                if (ann.tool_type === 'polyline') {
                    const pa = ann as PolylineAnnotation;
                    record.lineStyle = pa.lineStyle;
                    record.lineStrokeWidth = pa.strokeWidth;
                }
                return db.create(new Table("image_annotation")).content(record);
            });
            await Promise.all(annotationPromises);
        }

        revalidatePath(budgetRevalidatePath(params.budgetId));
        return { success: true, imageId };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Erro ao salvar imagem e anotações:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: String(error) };
    }
}

export async function deleteBudgetImage(imageId: string, budgetId: string) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const imageRecordId = requireRecordId("budget_image", imageId);
        const budgetRecordId = requireRecordId("budget", budgetId);
        const [rows] = await db.query<[DbImage[]]>(
            "SELECT * FROM budget_image WHERE id = $imageId AND budget_id = $budgetId",
            { imageId: imageRecordId, budgetId: budgetRecordId }
        );
        if (!rows?.[0]) {
            return { success: false, error: "Imagem não encontrada ou não pertence ao orçamento" };
        }

        await db.query("DELETE image_annotation WHERE image_id = $imageId", { imageId: imageRecordId });
        await db.delete(imageRecordId);
        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Erro ao excluir imagem:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: String(error) };
    }
}

export async function getBudgetImagesBySection(sectionId: string) {
    const auth = await assertActionSession();
    if (!auth.ok) return [];

    const db = await getDb();
    try {
        const sectionRecordId = requireRecordId("budget_section", sectionId);
        const [images] = await db.query<[DbImage[]]>(`
            SELECT * FROM budget_image
            WHERE section_id = $sectionId
            ORDER BY order_index ASC, created_at ASC
        `, { sectionId: sectionRecordId });
        if (!images) return [];
        return fetchAnnotationsForImages(db, images);
    } catch (error) {
        if (error instanceof InvalidRecordIdError) return [];
        console.error("Erro ao buscar imagens do trecho:", error);
        if (isTokenExpiredError(error)) resetDb();
        return [];
    }
}

export async function getBudgetImagesByLocation(locationId: string) {
    const auth = await assertActionSession();
    if (!auth.ok) return [];

    const db = await getDb();
    try {
        const locationRecordId = requireRecordId("budget_location", locationId);
        const [images] = await db.query<[DbImage[]]>(`
            SELECT * FROM budget_image
            WHERE location_id = $locationId
            ORDER BY order_index ASC, created_at ASC
        `, { locationId: locationRecordId });
        if (!images) return [];
        return fetchAnnotationsForImages(db, images);
    } catch (error) {
        if (error instanceof InvalidRecordIdError) return [];
        console.error("Erro ao buscar imagens do local:", error);
        if (isTokenExpiredError(error)) resetDb();
        return [];
    }
}

export async function getBudgetImages(budgetId: string) {
    const auth = await assertActionSession();
    if (!auth.ok) return [];

    const db = await getDb();
    try {
        const budgetRecordId = requireRecordId("budget", budgetId);
        const [images] = await db.query<[DbImage[]]>(`
            SELECT * FROM budget_image
            WHERE budget_id = $budgetId
            ORDER BY order_index ASC, created_at ASC
        `, { budgetId: budgetRecordId });
        if (!images) return [];
        return fetchAnnotationsForImages(db, images);
    } catch (error) {
        if (error instanceof InvalidRecordIdError) return [];
        console.error("Erro ao buscar imagens:", error);
        if (isTokenExpiredError(error)) resetDb();
        return [];
    }
}

export async function getBudgetImagesByBlock(blockId: string) {
    const auth = await assertActionSession();
    if (!auth.ok) return [];

    const db = await getDb();
    try {
        const blockRecordId = requireRecordId("budget_block", blockId);
        const [images] = await db.query<[DbImage[]]>(`
            SELECT * FROM budget_image
            WHERE block_id = $blockId
            ORDER BY order_index ASC, created_at ASC
        `, { blockId: blockRecordId });
        if (!images) return [];
        return fetchAnnotationsForImages(db, images);
    } catch (error) {
        if (error instanceof InvalidRecordIdError) return [];
        console.error("Erro ao buscar imagens do bloco:", error);
        if (isTokenExpiredError(error)) resetDb();
        return [];
    }
}

/** Carrega imagens de múltiplos blocos em uma única query (usado pelo compositor). */
export async function getBudgetImagesByBlocks(blockIds: string[]): Promise<Record<string, Awaited<ReturnType<typeof fetchAnnotationsForImages>>[number][]>> {
    if (!blockIds.length) return {};
    const auth = await assertActionSession();
    if (!auth.ok) return {};

    const db = await getDb();
    try {
        const blockRecordIds = blockIds.map((id) => requireRecordId("budget_block", id));
        const [images] = await db.query<[DbImage[]]>(`
            SELECT * FROM budget_image
            WHERE block_id INSIDE $blockIds
            ORDER BY order_index ASC, created_at ASC
        `, { blockIds: blockRecordIds });
        if (!images?.length) return {};
        const withAnnotations = await fetchAnnotationsForImages(db, images);
        const result: Record<string, typeof withAnnotations> = {};
        for (const img of withAnnotations) {
            const blockId = img.block_id ? String(img.block_id) : "";
            if (!blockId) continue;
            if (!result[blockId]) result[blockId] = [];
            result[blockId].push(img);
        }
        return result;
    } catch (error) {
        if (error instanceof InvalidRecordIdError) return {};
        console.error("Erro ao buscar imagens dos blocos em batch:", error);
        if (isTokenExpiredError(error)) resetDb();
        return {};
    }
}

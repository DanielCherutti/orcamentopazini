"use server";

import { revalidatePath } from "next/cache";
import { Table } from "surrealdb";
import { assertWriteActionSession } from "@/actions/auth-actions";
import { seedDeliveryCompositorBlocksAction } from "@/actions/delivery-compositor-block-actions";
import { auditTenantAction } from "@/lib/audit-log";
import { assertEntityInActiveTenant } from "@/lib/tenant-access";
import { getDb } from "@/lib/surreal";
import { recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";
import { normalizeModelTemplateStructure } from "@/lib/model-template-structure";
import { DEFAULT_COVER_PROPS, DEFAULT_HEADER_FOOTER_PROPS } from "@/types/budget-compositor-types";
import type { Modelo, ModeloTipo } from "@/actions/model-actions";

type TemplateBlock = {
    id?: unknown;
    parent_id?: unknown;
    type?: unknown;
    label?: unknown;
    order_index?: unknown;
    props?: unknown;
};

export async function importDatabookTemplateAction(databookId: string, templateId: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };
    const [bookGate, templateGate] = await Promise.all([
        assertEntityInActiveTenant("databook", databookId),
        assertEntityInActiveTenant("databook_template", templateId),
    ]);
    if (!bookGate.ok) return { success: false, error: bookGate.error };
    if (!templateGate.ok) return { success: false, error: templateGate.error };

    try {
        const db = await getDb();
        const rows = await db.query<[Array<Record<string, unknown>>]>(
            "SELECT * FROM $id LIMIT 1",
            { id: requireRecordId("databook_template", templateId) },
        );
        const template = rows[0]?.[0];
        if (!template) return { success: false, error: "Modelo não encontrado" };

        const existing = await db.query<[Array<{ id: unknown }>]>(
            "SELECT id FROM delivery_block WHERE delivery_project_id = $book AND deleted_at IS NONE",
            { book: requireRecordId("databook", databookId) },
        );
        const deletedAt = new Date().toISOString();
        for (const block of existing[0] ?? []) {
            await db.update(requireRecordId("delivery_block", recordIdToString(block.id))).merge({
                deleted_at: deletedAt,
            });
        }

        const templateBlocks = Array.isArray(template.compositor_blocks)
            ? template.compositor_blocks as TemplateBlock[]
            : [];
        if (templateBlocks.length) {
            const idMap = new Map<string, string>();
            const pending = [...templateBlocks];
            while (pending.length) {
                const index = pending.findIndex((block) => {
                    const parent = block.parent_id ? recordIdToString(block.parent_id) : "";
                    return !parent || idMap.has(parent);
                });
                if (index < 0) break;
                const [block] = pending.splice(index, 1);
                const oldId = recordIdToString(block.id);
                const oldParent = block.parent_id ? recordIdToString(block.parent_id) : "";
                const parent = oldParent ? idMap.get(oldParent) : null;
                const created = await db.create(new Table("delivery_block")).content({
                    delivery_project_id: requireRecordId("databook", databookId),
                    ...(parent ? { parent_id: requireRecordId("delivery_block", parent) } : {}),
                    type: String(block.type ?? "session"),
                    label: String(block.label ?? "Seção"),
                    order_index: Number(block.order_index ?? 0),
                    props: structuredClone(block.props ?? {}),
                });
                if (oldId) {
                    idMap.set(oldId, recordIdToString(((Array.isArray(created) ? created[0] : created) as Record<string, unknown>).id));
                }
            }
        }

        await seedDeliveryCompositorBlocksAction(databookId);

        if (!templateBlocks.length && Array.isArray(template.areas)) {
            let order = 10;
            for (const rawArea of template.areas) {
                if (!rawArea || typeof rawArea !== "object") continue;
                const area = rawArea as Record<string, unknown>;
                const session = await db.create(new Table("delivery_block")).content({
                    delivery_project_id: requireRecordId("databook", databookId),
                    type: "session",
                    label: `${String(area.code ?? "")} ${String(area.title ?? "Seção")}`.trim(),
                    order_index: order++,
                    props: {},
                });
                const sessionId = recordIdToString(((Array.isArray(session) ? session[0] : session) as Record<string, unknown>).id);
                const checklist = Array.isArray(area.checklist)
                    ? area.checklist.map((item) => `• ${String((item as Record<string, unknown>)?.text ?? "")}`).join("<br>")
                    : "";
                const description = [String(area.description ?? ""), checklist].filter(Boolean).join("<br><br>");
                if (description) {
                    await db.create(new Table("delivery_block")).content({
                        delivery_project_id: requireRecordId("databook", databookId),
                        parent_id: requireRecordId("delivery_block", sessionId),
                        type: "text",
                        label: "Conteúdo",
                        order_index: 0,
                        props: { description },
                    });
                }
            }
        }

        await db.update(requireRecordId("databook", databookId)).merge({
            template_id: requireRecordId("databook_template", templateId),
            pdf_outdated: true,
            updated_at: new Date().toISOString(),
        });
        await auditTenantAction({
            action: "databook.template.import",
            resourceType: "databook",
            resourceId: databookId,
            summary: `Modelo ${String(template.name ?? "")} importado no DataBook`,
            metadata: { templateId },
        });
        revalidatePath(`/dashboard/databook-documents/${encodeURIComponent(databookId)}`);
        return { success: true };
    } catch (error) {
        console.error("importDatabookTemplateAction:", error);
        return { success: false, error: "Erro ao importar modelo" };
    }
}

export async function importPlatformModelToDatabookAction(
    databookId: string,
    modeloId: string,
    targetPageScope: "all" | "cover" | "inner" = "all",
) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };
    const [bookGate, modelGate] = await Promise.all([
        assertEntityInActiveTenant("databook", databookId),
        assertEntityInActiveTenant("modelos", modeloId, "Modelo não encontrado"),
    ]);
    if (!bookGate.ok) return { success: false, error: bookGate.error };
    if (!modelGate.ok) return { success: false, error: modelGate.error };
    try {
        const db = await getDb();
        const raw = await db.select<Record<string, unknown>>(requireRecordId("modelos", modeloId));
        const row = Array.isArray(raw) ? raw[0] : raw;
        if (!row) return { success: false, error: "Modelo não encontrado" };
        const tipo = String(row.tipo ?? "") as ModeloTipo;
        if (!["capa", "cabecalho", "rodape", "databook_completo"].includes(tipo)) {
            return { success: false, error: "Este tipo de modelo não pode ser aplicado ao DataBook" };
        }
        const modelo: Modelo = {
            id: recordIdToString(row.id),
            nome: String(row.nome ?? ""),
            tipo,
            conteudo: String(row.conteudo ?? ""),
            estrutura: normalizeModelTemplateStructure(tipo, row.estrutura, String(row.conteudo ?? "")),
        };
        await seedDeliveryCompositorBlocksAction(databookId);
        const bookRecord = requireRecordId("databook", databookId);
        const findRoot = async (type: string) => {
            const result = await db.query<[Array<{ id: unknown; order_index: number; props?: Record<string, unknown> }>]>(
                `SELECT id, order_index, props FROM delivery_block WHERE delivery_project_id = $book
                 AND parent_id IS NONE AND type = $type AND deleted_at IS NONE
                 ORDER BY order_index ASC LIMIT 1`,
                { book: bookRecord, type },
            );
            return result[0]?.[0];
        };
        const mergeRootProps = async (type: string, props: Record<string, unknown>) => {
            const block = await findRoot(type);
            if (!block) throw new Error(`Bloco ${type} não encontrado`);
            await db.update(requireRecordId("delivery_block", recordIdToString(block.id))).merge({
                props: { ...(block.props ?? {}), ...props },
                updated_at: new Date().toISOString(),
            });
        };

        if (tipo === "capa" && modelo.estrutura.kind === "cover") {
            await mergeRootProps("cover", { ...DEFAULT_COVER_PROPS, ...modelo.estrutura.props });
        } else if ((tipo === "cabecalho" || tipo === "rodape") && modelo.estrutura.kind === "header_footer") {
            const source = modelo.estrutura.props;
            const isHeader = tipo === "cabecalho";
            const hasElements = (layout: unknown) => Boolean(
                layout
                && typeof layout === "object"
                && Array.isArray((layout as { elements?: unknown[] }).elements)
                && (layout as { elements: unknown[] }).elements.length,
            );
            const chooseLayout = (...layouts: unknown[]) =>
                layouts.find(hasElements) ?? { version: 1, elements: [] };
            const availableLayouts = isHeader
                ? [source.all_header_layout, source.cover_header_layout, source.inner_header_layout]
                : [source.all_footer_layout, source.cover_footer_layout, source.inner_footer_layout];
            if (!availableLayouts.some(hasElements)) {
                return {
                    success: false,
                    error: `O modelo selecionado não possui elementos visuais de ${isHeader ? "cabeçalho" : "rodapé"}`,
                };
            }
            const sharedLayout = isHeader
                ? chooseLayout(source.all_header_layout, source.cover_header_layout, source.inner_header_layout)
                : chooseLayout(source.all_footer_layout, source.cover_footer_layout, source.inner_footer_layout);
            const coverLayout = isHeader
                ? chooseLayout(source.cover_header_layout, source.all_header_layout, source.inner_header_layout)
                : chooseLayout(source.cover_footer_layout, source.all_footer_layout, source.inner_footer_layout);
            const innerLayout = isHeader
                ? chooseLayout(source.inner_header_layout, source.all_header_layout, source.cover_header_layout)
                : chooseLayout(source.inner_footer_layout, source.all_footer_layout, source.cover_footer_layout);
            const patch: Record<string, unknown> = targetPageScope === "all"
                ? isHeader
                    ? { header_footer_scope_mode: "all", cover_show_header_band: true, inner_show_header_band: true, cover_header_height: source.cover_header_height ?? 96, inner_header_height: source.inner_header_height ?? 96, all_header_layout: sharedLayout, page_numbering: source.page_numbering }
                    : { header_footer_scope_mode: "all", cover_show_footer_band: true, inner_show_footer_band: true, cover_footer_height: source.cover_footer_height ?? 40, inner_footer_height: source.inner_footer_height ?? 40, all_footer_layout: sharedLayout, page_numbering: source.page_numbering }
                : targetPageScope === "cover"
                    ? isHeader
                        ? { header_footer_scope_mode: "separate", cover_show_header_band: true, cover_header_height: source.cover_header_height ?? 96, cover_header_layout: coverLayout }
                        : { header_footer_scope_mode: "separate", cover_show_footer_band: true, cover_footer_height: source.cover_footer_height ?? 40, cover_footer_layout: coverLayout }
                    : isHeader
                        ? { header_footer_scope_mode: "separate", inner_show_header_band: true, inner_header_height: source.inner_header_height ?? 96, inner_header_layout: innerLayout }
                        : { header_footer_scope_mode: "separate", inner_show_footer_band: true, inner_footer_height: source.inner_footer_height ?? 40, inner_footer_layout: innerLayout };
            // Preserve the opposite region already configured. Importing a header must not
            // reset the footer (and vice versa) back to the platform defaults.
            await mergeRootProps("header_footer", patch);
        } else if (tipo === "databook_completo" && modelo.estrutura.kind === "budget") {
            const current = await db.query<[Array<{ id: unknown }>]>(
                `SELECT id FROM delivery_block WHERE delivery_project_id = $book
                 AND deleted_at IS NONE AND type IN ["session", "text"]`,
                { book: bookRecord },
            );
            for (const block of current[0] ?? []) {
                await db.update(requireRecordId("delivery_block", recordIdToString(block.id))).merge({
                    deleted_at: new Date().toISOString(),
                });
            }
            const cover = modelo.estrutura.blocks.find((block) => block.type === "cover");
            const headerFooter = modelo.estrutura.blocks.find((block) => block.type === "header_footer");
            if (cover) await mergeRootProps("cover", { ...DEFAULT_COVER_PROPS, ...cover.props });
            if (headerFooter) await mergeRootProps("header_footer", { ...DEFAULT_HEADER_FOOTER_PROPS, ...headerFooter.props });
            const authored = modelo.estrutura.blocks.filter((block) => block.type === "session" || block.type === "text");
            const ids = new Map<string, string>();
            const pending = [...authored];
            while (pending.length) {
                const before = pending.length;
                for (let index = pending.length - 1; index >= 0; index -= 1) {
                    const block = pending[index]!;
                    const parent = block.parent_id ? ids.get(block.parent_id) : null;
                    if (block.parent_id && !parent) continue;
                    const created = await db.create(new Table("delivery_block")).content({
                        delivery_project_id: bookRecord,
                        ...(parent ? { parent_id: requireRecordId("delivery_block", parent) } : {}),
                        type: block.type,
                        label: block.label,
                        order_index: block.order_index + 10,
                        props: structuredClone(block.props),
                    });
                    ids.set(block.id, recordIdToString(((Array.isArray(created) ? created[0] : created) as Record<string, unknown>).id));
                    pending.splice(index, 1);
                }
                if (pending.length === before) throw new Error("Estrutura inválida no modelo de DataBook");
            }
        }

        await db.update(bookRecord).merge({ pdf_outdated: true, updated_at: new Date().toISOString() });
        await auditTenantAction({
            action: "databook.platform_model.import",
            resourceType: "databook",
            resourceId: databookId,
            summary: `Modelo ${modelo.nome} importado no DataBook`,
            metadata: { modeloId, tipo, targetPageScope },
        });
        revalidatePath(`/dashboard/databook-documents/${encodeURIComponent(databookId)}`);
        return { success: true };
    } catch (error) {
        console.error("importPlatformModelToDatabookAction:", error);
        return { success: false, error: "Falha ao importar modelo da plataforma" };
    }
}

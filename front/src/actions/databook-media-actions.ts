"use server";

import { revalidatePath } from "next/cache";
import { Table } from "surrealdb";
import { z } from "zod";
import { assertActionSession, assertWriteActionSession } from "@/actions/auth-actions";
import { assertEntityInActiveTenant } from "@/lib/tenant-access";
import { getDb, toPlain } from "@/lib/surreal";
import { recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";
import type { DatabookMedia } from "@/types/databook-types";

const inputSchema = z.object({
    installation_id: z.string().optional(),
    installation_product_id: z.string().optional(),
    file_url: z.string().min(1),
    filename: z.string().min(1).max(500),
    mime_type: z.string().regex(/^image\//),
    caption: z.string().max(1000).optional(),
    alt_text: z.string().max(1000).optional(),
    category: z.string().max(100).optional(),
    include_in_figure_list: z.boolean().default(true),
});

export async function listDatabookMediaAction(databookId: string) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error, data: [] as DatabookMedia[] };
    const gate = await assertEntityInActiveTenant("databook", databookId);
    if (!gate.ok) return { success: false, error: gate.error, data: [] as DatabookMedia[] };
    const db = await getDb();
    const rows = await db.query<[Array<Record<string, unknown>>]>(
        "SELECT * FROM databook_media WHERE databook_id = $book AND deleted_at IS NONE ORDER BY position ASC, created_at ASC",
        { book: requireRecordId("databook", databookId) },
    );
    return { success: true, data: toPlain((rows[0] ?? []).map((row) => ({
        ...row,
        id: recordIdToString(row.id),
        databook_id: recordIdToString(row.databook_id),
        installation_id: row.installation_id ? recordIdToString(row.installation_id) : undefined,
        installation_product_id: row.installation_product_id ? recordIdToString(row.installation_product_id) : undefined,
    }))) as DatabookMedia[] };
}

export async function createDatabookMediaAction(databookId: string, raw: z.input<typeof inputSchema>) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };
    const gate = await assertEntityInActiveTenant("databook", databookId);
    if (!gate.ok) return { success: false, error: gate.error };
    const parsed = inputSchema.safeParse(raw);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Imagem inválida" };
    const db = await getDb();
    const count = await db.query<[Array<{ count?: number }>]>(
        "SELECT count() FROM databook_media WHERE databook_id = $book AND deleted_at IS NONE GROUP ALL",
        { book: requireRecordId("databook", databookId) },
    );
    const created = await db.create(new Table("databook_media")).content({
        ...parsed.data,
        databook_id: requireRecordId("databook", databookId),
        installation_id: parsed.data.installation_id ? requireRecordId("databook_installation", parsed.data.installation_id) : null,
        installation_product_id: parsed.data.installation_product_id ? requireRecordId("databook_installation_product", parsed.data.installation_product_id) : null,
        position: Number(count[0]?.[0]?.count ?? 0),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    });
    await db.update(requireRecordId("databook", databookId)).merge({ pdf_outdated: true, updated_at: new Date().toISOString() });
    revalidatePath(`/dashboard/databook-documents/${encodeURIComponent(databookId)}`);
    return { success: true, id: recordIdToString(((Array.isArray(created) ? created[0] : created) as Record<string, unknown>).id) };
}

export async function deleteDatabookMediaAction(databookId: string, mediaId: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };
    const gate = await assertEntityInActiveTenant("databook", databookId);
    if (!gate.ok) return { success: false, error: gate.error };
    try {
        const db = await getDb();
        const mediaRecord = requireRecordId("databook_media", mediaId);
        const rows = await db.query<[Array<{ id: unknown }>]>(
            `SELECT id FROM $media WHERE databook_id = $book
             AND deleted_at IS NONE LIMIT 1`,
            {
                media: mediaRecord,
                book: requireRecordId("databook", databookId),
            },
        );
        if (!rows[0]?.[0]) return { success: false, error: "Foto não encontrada neste DataBook" };
        const now = new Date().toISOString();
        await db.update(mediaRecord).merge({ deleted_at: now, updated_at: now });
        await db.update(requireRecordId("databook", databookId)).merge({
            pdf_outdated: true,
            updated_at: now,
        });
        revalidatePath(`/dashboard/databook-documents/${encodeURIComponent(databookId)}`);
        return { success: true };
    } catch (error) {
        console.error("deleteDatabookMediaAction:", error);
        return { success: false, error: "Erro ao excluir foto" };
    }
}

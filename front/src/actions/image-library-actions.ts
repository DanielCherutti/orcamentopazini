"use server";

import { Table } from "surrealdb";
import { z } from "zod";
import { assertWriteActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { deleteFile } from "@/lib/upload";
import { InvalidRecordIdError, requireRecordId } from "@/lib/surreal-record-ids";
import { requireActiveTenantId, tenantRecordId } from "@/lib/tenant-query";
import { assertEntityInActiveTenant } from "@/lib/tenant-access";
import { auditTenantAction } from "@/lib/audit-log";

export type LibraryImage = {
    id: string;
    name: string;
    url: string;
    tags?: string[];
    width?: number;
    height?: number;
    created_at?: string;
};

export type ReusableLogo = {
    id: string;
    name: string;
    url: string;
    source: "customer" | "library";
};

const TABLE_NAME = "image_library";

const createSchema = z.object({
    name: z.string().min(1, "O nome é obrigatório"),
    url: z.string().min(1, "A URL é obrigatória"),
    width: z.number().optional(),
    height: z.number().optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeImage(image: any): LibraryImage {
    if (!image) return image;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const safeId = (id: any): string => {
        if (!id) return "";
        if (typeof id === "string") return id;
        if (typeof id === "object" && typeof id.toString === "function") {
            const str = id.toString();
            if (str === "[object Object]" && id.id && id.tb) return `${id.tb}:${id.id}`;
            if (str !== "[object Object]") return str;
        }
        return String(id);
    };

    return {
        id: safeId(image.id),
        name: String(image.name || ""),
        url: String(image.url || ""),
        tags: Array.isArray(image.tags) ? image.tags.map(String) : undefined,
        width: image.width != null ? Number(image.width) : undefined,
        height: image.height != null ? Number(image.height) : undefined,
        created_at: image.created_at ? String(image.created_at) : undefined,
    };
}

export async function getLibraryImagesAction(params?: {
    query?: string;
    limit?: number;
    page?: number;
}) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    const page = params?.page || 1;
    const limit = params?.limit || 50;
    const start = (page - 1) * limit;
    const search = params?.query || "";

    try {
        const tenantId = await requireActiveTenantId();
        let sql = `SELECT * FROM ${TABLE_NAME} WHERE tenant_id = $tenantId`;
        const queryParams: Record<string, unknown> = { tenantId: tenantRecordId(tenantId) };

        if (search) {
            sql += ` AND name CONTAINS $search`;
            queryParams.search = search;
        }

        sql += ` ORDER BY created_at DESC LIMIT $limit START $start`;
        queryParams.limit = limit;
        queryParams.start = start;

        const result = await db.query<[LibraryImage[]]>(sql, queryParams);
        const images = (result[0] || []).map(serializeImage);

        return { success: true, data: toPlain(images) };
    } catch (error) {
        console.error("Error fetching library images:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao buscar imagens da biblioteca" };
    }
}

export async function getReusableLogosAction(params?: {
    query?: string;
    limit?: number;
}) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        const tenantRecord = tenantRecordId(tenantId);
        const [customerResult, libraryResult] = await Promise.all([
            db.query<[Array<{ id?: unknown; name?: unknown; logo_url?: unknown }>]>(
                `SELECT id, name, logo_url FROM client
                 WHERE tenant_id = $tenantId AND logo_url != NONE
                 ORDER BY name ASC LIMIT 500`,
                { tenantId: tenantRecord },
            ),
            db.query<[Array<{ id?: unknown; name?: unknown; url?: unknown }>]>(
                `SELECT id, name, url FROM ${TABLE_NAME}
                 WHERE tenant_id = $tenantId
                 ORDER BY created_at DESC LIMIT 500`,
                { tenantId: tenantRecord },
            ),
        ]);

        const safeId = (id: unknown): string => {
            if (id && typeof id === "object" && "toString" in id) {
                return String((id as { toString(): string }).toString());
            }
            return String(id ?? "");
        };
        const candidates: ReusableLogo[] = [
            ...(customerResult[0] ?? []).map((row) => ({
                id: `customer-${safeId(row.id)}`,
                name: String(row.name ?? "Cliente"),
                url: String(row.logo_url ?? "").trim(),
                source: "customer" as const,
            })),
            ...(libraryResult[0] ?? []).map((row) => ({
                id: `library-${safeId(row.id)}`,
                name: String(row.name ?? "Imagem da biblioteca"),
                url: String(row.url ?? "").trim(),
                source: "library" as const,
            })),
        ];
        const normalizedQuery = String(params?.query ?? "").trim().toLocaleLowerCase("pt-BR");
        const seenUrls = new Set<string>();
        const logos = candidates.filter((logo) => {
            if (!logo.url || seenUrls.has(logo.url)) return false;
            if (
                normalizedQuery &&
                !`${logo.name} ${logo.url}`.toLocaleLowerCase("pt-BR").includes(normalizedQuery)
            ) {
                return false;
            }
            seenUrls.add(logo.url);
            return true;
        });
        const limit = Math.max(1, Math.min(200, Math.trunc(params?.limit ?? 80)));
        return { success: true, data: toPlain(logos.slice(0, limit)) };
    } catch (error) {
        console.error("Error fetching reusable logos:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao buscar logotipos" };
    }
}

export async function createLibraryImageAction(data: {
    name: string;
    url: string;
    width?: number;
    height?: number;
}) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();

    const validated = createSchema.safeParse(data);
    if (!validated.success) {
        const errors = validated.error.flatten().fieldErrors;
        return { success: false, error: "Erro de validação", fieldErrors: errors };
    }

    try {
        const tenantId = await requireActiveTenantId();
        const created = await db.create(new Table(TABLE_NAME)).content({
            ...validated.data,
            tenant_id: tenantRecordId(tenantId),
            created_at: new Date().toISOString(),
        });

        const image = Array.isArray(created) ? created[0] : created;
        const serialized = serializeImage(image);
        await auditTenantAction({
            action: "image_library.create",
            resourceType: "image_library",
            resourceId: serialized.id,
            summary: `Imagem adicionada à biblioteca: ${validated.data.name}`,
        });
        return { success: true, data: toPlain(serialized) };
    } catch (error) {
        console.error("Error creating library image:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao criar imagem na biblioteca" };
    }
}

export async function deleteLibraryImageAction(id: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const entityGate = await assertEntityInActiveTenant(TABLE_NAME, id, "Imagem não encontrada");
    if (!entityGate.ok) return { success: false, error: entityGate.error };

    const db = await getDb();

    try {
        const recordId = requireRecordId(TABLE_NAME, id);
        const result = await db.query<[LibraryImage[]]>(
            `SELECT url FROM ${TABLE_NAME} WHERE id = $id`,
            { id: recordId }
        );

        const image = result[0]?.[0];
        if (image?.url) {
            await deleteFile(image.url);
        }

        await db.delete(recordId);

        await auditTenantAction({
            action: "image_library.delete",
            resourceType: "image_library",
            resourceId: id,
            summary: "Imagem removida da biblioteca",
        });
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error deleting library image:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao excluir imagem" };
    }
}

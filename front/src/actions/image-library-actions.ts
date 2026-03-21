"use server";

import { Table, StringRecordId } from "surrealdb";
import { z } from "zod";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { deleteFile } from "@/lib/upload";

export type LibraryImage = {
    id: string;
    name: string;
    url: string;
    tags?: string[];
    width?: number;
    height?: number;
    created_at?: string;
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
    const db = await getDb();
    const page = params?.page || 1;
    const limit = params?.limit || 50;
    const start = (page - 1) * limit;
    const search = params?.query || "";

    try {
        let sql = `SELECT * FROM ${TABLE_NAME}`;
        const queryParams: Record<string, unknown> = {};

        if (search) {
            sql += ` WHERE name CONTAINS $search`;
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

export async function createLibraryImageAction(data: {
    name: string;
    url: string;
    width?: number;
    height?: number;
}) {
    const db = await getDb();

    const validated = createSchema.safeParse(data);
    if (!validated.success) {
        const errors = validated.error.flatten().fieldErrors;
        return { success: false, error: "Erro de validação", fieldErrors: errors };
    }

    try {
        const created = await db.create(new Table(TABLE_NAME)).content({
            ...validated.data,
            created_at: new Date().toISOString(),
        });

        const image = Array.isArray(created) ? created[0] : created;
        return { success: true, data: toPlain(serializeImage(image)) };
    } catch (error) {
        console.error("Error creating library image:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao criar imagem na biblioteca" };
    }
}

export async function deleteLibraryImageAction(id: string) {
    const db = await getDb();

    try {
        // Fetch to get the file URL before deleting
        const formattedId = id.startsWith("image_library:") ? id : `image_library:${id}`;
        const result = await db.query<[LibraryImage[]]>(
            `SELECT url FROM ${TABLE_NAME} WHERE id = $id`,
            { id: formattedId }
        );

        const image = result[0]?.[0];
        if (image?.url) {
            await deleteFile(image.url);
        }

        await db.delete(new StringRecordId(formattedId));

        return { success: true };
    } catch (error) {
        console.error("Error deleting library image:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao excluir imagem" };
    }
}

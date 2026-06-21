
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Table } from "surrealdb";
import { assertActionSession, assertWriteActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError, isDbConnectionError } from "@/lib/surreal";
import { requireActiveTenantId, tenantRecordId } from "@/lib/tenant-query";
import { assertEntityInActiveTenant } from "@/lib/tenant-access";
import { InvalidRecordIdError, recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";
import { Attachment } from "@/components/products/attachment-manager";
import { saveFile } from "@/lib/upload";
import { syncProductCatalogToDraftBudgetItemsAction } from "@/actions/budget-core-write-actions";
import { auditTenantAction } from "@/lib/audit-log";

// Type definition based on V1 Spec
export type Product = {
    id?: string;
    company_id: number;
    code: string;
    description: string;
    detailedDescription?: string;
    unit: string;
    equipmentPrice: number;
    assemblyPrice: number;
    assemblyPriceType?: "fixed" | "percentage";
    assemblyPricePercentage?: number | null;
    imageUrl?: string;
    group_ids?: string[];
    attachments?: Attachment[];
    created_at?: string;
};

const TABLE_NAME = "product";
const DEFAULT_COMPANY_ID = 0;

// Schema for Validation
const productSchema = z.object({
    code: z.string().min(1, "O código é obrigatório"),
    description: z.string().min(1, "A descrição é obrigatória"),
    unit: z.string().min(1, "A unidade é obrigatória"),
    equipmentPrice: z.number().min(0, "O preço não pode ser negativo"),
    assemblyPrice: z.number().min(0, "O preço não pode ser negativo").default(0),
    assemblyPriceType: z.enum(["fixed", "percentage"]).default("fixed"),
    assemblyPricePercentage: z.number().nullable().optional(),
    detailedDescription: z.string().optional(),
    imageUrl: z.string().optional(),
    group_ids: z.array(z.string()).optional(),
    attachments: z.array(z.record(z.string(), z.unknown())).optional(),
});


// Helper to serialize SurrealDB results (convert RecordId to string)
function serializeProduct(product: Record<string, unknown>): Product {
    if (!product) return product as unknown as Product;

    // Helper function to safely convert ID to string (incl. SurrealDB RecordId)
    const safeId = (id: unknown): string => {
        if (!id) return "";
        if (typeof id === "string") return id;
        if (typeof id === "object" && id !== null && typeof (id as Record<string, unknown>).toString === "function") {
            const obj = id as Record<string, unknown>;
            const str = String(obj);
            if (str === "[object Object]" && obj.id && obj.tb) return `${obj.tb}:${obj.id}`;
            if (str !== "[object Object]") return str;
        }
        return String(id);
    };

    // Destructure specifically to avoid carrying over hidden properties or non-serializable objects
    return {
        id: safeId(product.id),
        company_id: Number(product.company_id || 0),
        code: String(product.code || ''),
        description: String(product.description || ''),
        detailedDescription: product.detailedDescription ? String(product.detailedDescription) : undefined,
        unit: String(product.unit || ''),
        equipmentPrice: Number(product.equipmentPrice || 0),
        assemblyPrice: Number(product.assemblyPrice || 0),
        assemblyPriceType: (product.assemblyPriceType === "percentage" ? "percentage" : "fixed") as "fixed" | "percentage",
        assemblyPricePercentage: product.assemblyPricePercentage != null ? Number(product.assemblyPricePercentage) : null,
        imageUrl: product.imageUrl ? String(product.imageUrl) : undefined,
        group_ids: Array.isArray(product.group_ids)
            ? (product.group_ids as unknown[]).map((gid) => safeId(gid))
            : product.group_id ? [safeId(product.group_id)] : [],
        attachments: Array.isArray(product.attachments)
            ? JSON.parse(JSON.stringify(product.attachments))
            : [],
        created_at: product.created_at ? String(product.created_at) : undefined,
    };
}

export async function getProductsAction(params?: {
    page?: number;
    limit?: number;
    query?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
}) {
    const auth = await assertActionSession();
    if (!auth.ok) {
        return {
            success: false,
            error: auth.error,
            data: [],
            meta: { total: 0, page: params?.page || 1, limit: params?.limit || 10, totalPages: 0 },
        };
    }

    const page = params?.page || 1;
    const limit = params?.limit || 10;
    const start = (page - 1) * limit;
    const search = params?.query || "";
    const sortBy = params?.sortBy || "created_at";
    const sortOrder = params?.sortOrder || "desc";

    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        let sql = `SELECT * FROM ${TABLE_NAME} WHERE company_id = $company_id AND tenant_id = $tenantId`;
        const queryParams: Record<string, string | number | ReturnType<typeof tenantRecordId>> = {
            company_id: DEFAULT_COMPANY_ID,
            tenantId: tenantRecordId(tenantId),
        };



        if (search) {
            // Case-insensitive: compara em minúsculas nos dois lados
            sql += ` AND (string::lowercase(code) CONTAINS string::lowercase($search) OR string::lowercase(description) CONTAINS string::lowercase($search))`;
            queryParams.search = search;
        }

        // First, get the total count (without LIMIT)
        const countSql = sql;

        // Get all matching products (we'll sort and paginate in JS for proper locale support)
        const productsResult = await db.query<[Product[]]>(sql, queryParams);
        const countQueryResult = await db.query<[Product[]]>(countSql, queryParams);

        const allProducts = (productsResult[0] || []).map(serializeProduct);
        const total = countQueryResult[0]?.length || 0;

        // Sort with locale-aware collation (supports accents correctly)
        const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

        allProducts.sort((a, b) => {
            const aValue = a[sortBy as keyof Product];
            const bValue = b[sortBy as keyof Product];

            // Handle different types
            if (typeof aValue === 'string' && typeof bValue === 'string') {
                // Use locale-aware string comparison
                const comparison = collator.compare(aValue, bValue);
                return sortOrder === 'asc' ? comparison : -comparison;
            } else if (typeof aValue === 'number' && typeof bValue === 'number') {
                // Numeric comparison
                return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
            }

            return 0;
        });

        // Apply pagination after sorting
        const products = allProducts.slice(start, start + limit);

        return {
            success: true,
            data: products,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    } catch (error) {
        console.error("Error fetching products:", error);
        if (isTokenExpiredError(error) || isDbConnectionError(error)) resetDb();
        return {
            success: true,
            data: [],
            meta: { total: 0, page, limit, totalPages: 0 },
        };
    }
}


export async function getProductAction(id: string) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const tenantId = await requireActiveTenantId();
        const recordId = requireRecordId(TABLE_NAME, id);

        const result = await db.select<Product>(recordId);
        const data = Array.isArray(result) ? result[0] : result;

        if (!data) return { success: false, error: "Produto não encontrado" };

        const rowTenant = recordIdToString((data as unknown as Record<string, unknown>).tenant_id);
        if (rowTenant && rowTenant !== tenantId) {
            return { success: false, error: "Produto não encontrado" };
        }

        return { success: true, data: serializeProduct(data) };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error fetching product:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Produto não encontrado" };
    }
}



const parsePrice = (value: string | number) => {
    if (!value) return 0;
    if (typeof value === "number") return value;
    // Remove dots (thousands separators) and replace comma with dot
    // "1.200,50" -> "1200.50"
    const clean = value.replace(/\./g, "").replace(",", ".");
    return parseFloat(clean) || 0;
};

export async function createProductAction(formData: FormData) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();

    // Raw data extraction
    const rawData = {
        code: formData.get("code") as string,
        description: formData.get("description") as string,
        detailedDescription: formData.get("detailedDescription") as string,
        unit: formData.get("unit") as string,
        equipmentPrice: parsePrice(formData.get("equipmentPrice") as string),
        assemblyPrice: parsePrice(formData.get("assemblyPrice") as string),
        assemblyPriceType: (formData.get("assemblyPriceType") as string) || "fixed",
        assemblyPricePercentage: formData.get("assemblyPricePercentage")
            ? Number(formData.get("assemblyPricePercentage"))
            : null,
        imageUrl: formData.get("imageUrl") as string,
        group_ids: (() => {
            const raw = formData.get("group_ids") as string;
            if (!raw) return [];
            try { return JSON.parse(raw); } catch { return []; }
        })(),
        attachments: formData.get("attachments")
            ? JSON.parse(formData.get("attachments") as string)
            : []
    };

    // File separate handling
    const imageFile = formData.get("imageFile") as File;

    // Validation
    const validated = productSchema.safeParse(rawData);

    if (!validated.success) {
        const errors = validated.error.flatten().fieldErrors;
        return { success: false, error: "Erro de validação", fieldErrors: errors };
    }

    const data = validated.data;

    try {
        const tenantId = await requireActiveTenantId();
        // Check uniqueness
        const existing = await db.query<[Product[]]>(
            `SELECT id FROM ${TABLE_NAME} WHERE code = $code AND company_id = $company_id AND tenant_id = $tenantId`,
            {
                code: data.code,
                company_id: DEFAULT_COMPANY_ID,
                tenantId: tenantRecordId(tenantId),
            },
        );

        if (existing[0] && existing[0].length > 0) {
            return { success: false, error: "Já existe um produto com este código" };
        }

        // Converte group_ids para StringRecordId para que CONTAINS funcione no SurrealDB
        const groupRecordIds = (data.group_ids || []).map((gid) =>
            requireRecordId("product_group", gid)
        );

        // Create product first to get ID
        const created = await db.create(new Table(TABLE_NAME)).content({
            ...data,
            imageUrl: data.imageUrl || undefined,
            group_ids: groupRecordIds,
            company_id: DEFAULT_COMPANY_ID,
            tenant_id: tenantRecordId(tenantId),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });


        if (!created) {
            return { success: false, error: "Erro no banco de dados ao criar" };
        }

        const product = (Array.isArray(created) ? created[0] : created) as any;

        if (!product || !product.id) {
            return { success: false, error: "Erro no banco de dados: ID inválido" };
        }

        const newId = product.id.toString();
        const sanitizedId = newId.replace(":", "_");

        // If imageFile provided (and no imageUrl from async upload), save it now
        if (imageFile && imageFile.size > 0 && !data.imageUrl) {
            try {
                const savedUrl = await saveFile(imageFile, `products/${sanitizedId}`);
                await db.update(requireRecordId(TABLE_NAME, newId)).merge({ imageUrl: savedUrl });
                product.imageUrl = savedUrl;
            } catch (e) {
                console.error("Failed to save image after product creation:", e);
            }
        }

        revalidatePath("/dashboard/products");

        const returnData = Array.isArray(created)
            ? created.map(serializeProduct)
            : serializeProduct(product);

        await auditTenantAction({
            action: "product.create",
            resourceType: "product",
            resourceId: newId,
            summary: `Produto criado: ${data.code}`,
            metadata: { code: data.code },
        });

        return { success: true, data: returnData };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error creating product:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao criar produto" };
    }
}

export async function updateProductAction(id: string, formData: FormData) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const entityGate = await assertEntityInActiveTenant("product", id, "Produto não encontrado");
    if (!entityGate.ok) return { success: false, error: entityGate.error };

    const db = await getDb();

    // Raw data extraction (similar to create)
    const rawData = {
        code: formData.get("code") as string,
        description: formData.get("description") as string,
        detailedDescription: formData.get("detailedDescription") as string,
        unit: formData.get("unit") as string,
        equipmentPrice: parsePrice(formData.get("equipmentPrice") as string),
        assemblyPrice: parsePrice(formData.get("assemblyPrice") as string),
        assemblyPriceType: (formData.get("assemblyPriceType") as string) || "fixed",
        assemblyPricePercentage: formData.get("assemblyPricePercentage")
            ? Number(formData.get("assemblyPricePercentage"))
            : null,
        imageUrl: formData.get("imageUrl") as string,
        group_ids: (() => {
            const raw = formData.get("group_ids") as string;
            if (!raw) return [];
            try { return JSON.parse(raw); } catch { return []; }
        })(),
        attachments: formData.get("attachments")
            ? JSON.parse(formData.get("attachments") as string)
            : []
    };

    const imageFile = formData.get("imageFile") as File;

    // Validation
    const validated = productSchema.safeParse(rawData);

    if (!validated.success) {
        const errors = validated.error.flatten().fieldErrors;
        return { success: false, error: "Erro de validação", fieldErrors: errors };
    }

    const data = validated.data;

    try {
        const productRecordId = requireRecordId(TABLE_NAME, id);
        const formattedId = String(productRecordId);

        // Handle file upload if new file provided via form submit (fallback)
        if (imageFile && imageFile.size > 0) {
            const sanitizedId = formattedId.replace(":", "_");
            data.imageUrl = await saveFile(imageFile, `products/${sanitizedId}`);
        }

        // Converte group_ids para StringRecordId para que CONTAINS funcione no SurrealDB
        const groupRecordIds = (data.group_ids || []).map((gid) =>
            requireRecordId("product_group", gid)
        );

        await db.update(productRecordId).merge({
            ...data,
            group_ids: groupRecordIds,
            updated_at: new Date().toISOString()
        });

        const syncBudgets = await syncProductCatalogToDraftBudgetItemsAction(id, {
            code: data.code,
            description: data.description,
            unit: data.unit,
            equipmentPrice: data.equipmentPrice,
            assemblyPrice: data.assemblyPrice,
            imageUrl: data.imageUrl,
        });
        if (!syncBudgets.success) {
            console.warn("Propagação do cadastro para orçamentos em andamento:", syncBudgets.error);
        }

        revalidatePath("/dashboard/products");
        const pathId = formattedId.includes(":") ? formattedId.split(":")[1] : formattedId;
        revalidatePath(`/dashboard/products/${pathId}`);

        await auditTenantAction({
            action: "product.update",
            resourceType: "product",
            resourceId: id,
            summary: `Produto atualizado: ${data.code}`,
            metadata: { code: data.code },
        });

        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error updating product:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao atualizar produto" };
    }
}

export async function updateProductImageUrlAction(productId: string, imageUrl: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const entityGate = await assertEntityInActiveTenant("product", productId, "Produto não encontrado");
    if (!entityGate.ok) return { success: false, error: entityGate.error };

    const db = await getDb();
    try {
        const recordId = requireRecordId(TABLE_NAME, productId);
        await db.update(recordId).merge({ imageUrl, updated_at: new Date().toISOString() });
        const rawP = await db.select(recordId);
        const p = (Array.isArray(rawP) ? rawP[0] : rawP) as Record<string, unknown> | undefined;
        if (p) {
            const syncRes = await syncProductCatalogToDraftBudgetItemsAction(productId, {
                code: String(p.code ?? ""),
                description: String(p.description ?? ""),
                unit: String(p.unit ?? ""),
                equipmentPrice: Number(p.equipmentPrice ?? 0),
                assemblyPrice: Number(p.assemblyPrice ?? 0),
                imageUrl,
            });
            if (!syncRes.success) {
                console.warn("Propagação da imagem para orçamentos em andamento:", syncRes.error);
            }
        }
        const pathId = String(recordId).includes(":") ? String(recordId).split(":")[1] : String(recordId);
        revalidatePath("/dashboard/products");
        revalidatePath(`/dashboard/products/${pathId}`);
        await auditTenantAction({
            action: "product.image_update",
            resourceType: "product",
            resourceId: productId,
            summary: "Imagem do produto atualizada",
        });
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error updating product image:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao atualizar imagem" };
    }
}

export async function getNextProductCodeAction() {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error, data: "0001" };

    const db = await getDb();
    try {
        const result = await db.query<[Array<{ code: string }>]>(
            `SELECT code FROM ${TABLE_NAME} WHERE company_id = $company_id`,
            { company_id: DEFAULT_COMPANY_ID }
        );
        const codes = result[0] ?? [];
        let maxNum = 0;
        for (const row of codes) {
            const num = parseInt(row.code, 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
        }
        const next = (maxNum + 1).toString().padStart(4, "0");
        return { success: true, data: next };
    } catch (error) {
        console.error("Error getting next product code:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: true, data: "0001" };
    }
}

export async function deleteProductAction(id: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const entityGate = await assertEntityInActiveTenant("product", id, "Produto não encontrado");
    if (!entityGate.ok) return { success: false, error: entityGate.error };

    const db = await getDb();
    try {
        await db.delete(requireRecordId(TABLE_NAME, id));

        revalidatePath("/dashboard/products");
        await auditTenantAction({
            action: "product.delete",
            resourceType: "product",
            resourceId: id,
            summary: "Produto excluído",
        });
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error deleting product:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao excluir produto" };
    }
}

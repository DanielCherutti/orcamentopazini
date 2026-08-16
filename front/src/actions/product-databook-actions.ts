"use server";

import { revalidatePath } from "next/cache";
import { Table } from "surrealdb";
import { z } from "zod";
import { assertActionSession, assertWriteActionSession } from "@/actions/auth-actions";
import { auditTenantAction } from "@/lib/audit-log";
import {
    DEFAULT_TECHNICAL_TABLE_SCHEMA,
    technicalTableSchemaValidator,
} from "@/lib/databooks/domain";
import { assertEntityInActiveTenant } from "@/lib/tenant-access";
import { requireActiveTenantId, tenantRecordId } from "@/lib/tenant-query";
import { getDb, toPlain } from "@/lib/surreal";
import { recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";
import type { ProductManual } from "@/types/databook-types";

const configInputSchema = z.object({
    manufacturer: z.string().max(300).optional(),
    table_schema: technicalTableSchemaValidator,
    default_structural_evaluation: z.string().max(30000).optional(),
    default_general_observations: z.string().max(30000).optional(),
    default_installation_description: z.string().max(30000).optional(),
    default_guidance: z.string().max(30000).optional(),
    default_conclusion: z.string().max(30000).optional(),
});

export type ProductDatabookConfigInput = z.input<typeof configInputSchema>;
export type ProductDatabookConfig = ProductDatabookConfigInput & {
    id?: string;
    product_id: string;
    schema_version: 1;
    updated_at?: string;
};

const manualInputSchema = z.object({
    title: z.string().trim().min(1, "O título do manual é obrigatório").max(300),
    description: z.string().max(5000).optional(),
    file_url: z.string().min(1, "Envie o PDF do manual"),
    filename: z.string().min(1),
    authorship: z.enum(["internal", "external"]),
    manufacturer: z.string().max(300).optional(),
    edition: z.string().max(100).optional(),
    document_date: z.string().optional(),
    code: z.string().max(100).optional(),
    language: z.string().max(80).optional(),
    active: z.boolean().default(true),
});

function defaultConfig(productId: string): ProductDatabookConfig {
    return {
        product_id: productId,
        table_schema: structuredClone(DEFAULT_TECHNICAL_TABLE_SCHEMA),
        schema_version: 1,
    };
}

export async function getProductDatabookConfigAction(productId: string) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };
    const gate = await assertEntityInActiveTenant("product", productId);
    if (!gate.ok) return { success: false, error: gate.error };
    try {
        const db = await getDb();
        const rows = await db.query<[Array<Record<string, unknown>>]>(
            "SELECT * FROM product_databook_config WHERE product_id = $product LIMIT 1",
            { product: requireRecordId("product", productId) },
        );
        const row = rows[0]?.[0];
        if (!row) return { success: true, data: defaultConfig(productId) };
        return {
            success: true,
            data: toPlain({
                ...row,
                id: recordIdToString(row.id),
                product_id: recordIdToString(row.product_id),
            }) as ProductDatabookConfig,
        };
    } catch (error) {
        console.error("getProductDatabookConfigAction:", error);
        return { success: false, error: "Erro ao carregar configuração do DataBook" };
    }
}

export async function saveProductDatabookConfigAction(
    productId: string,
    input: ProductDatabookConfigInput,
) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };
    const gate = await assertEntityInActiveTenant("product", productId);
    if (!gate.ok) return { success: false, error: gate.error };
    const parsed = configInputSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message ?? "Configuração inválida" };
    }
    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        const rows = await db.query<[Array<{ id: unknown }>]>(
            "SELECT id FROM product_databook_config WHERE product_id = $product LIMIT 1",
            { product: requireRecordId("product", productId) },
        );
        const content = {
            ...parsed.data,
            product_id: requireRecordId("product", productId),
            tenant_id: tenantRecordId(tenantId),
            schema_version: 1,
            updated_at: new Date().toISOString(),
        };
        if (rows[0]?.[0]) {
            await db.update(requireRecordId("product_databook_config", recordIdToString(rows[0][0].id))).merge(content);
        } else {
            await db.create(new Table("product_databook_config")).content({
                ...content,
                created_at: new Date().toISOString(),
            });
        }
        await auditTenantAction({
            action: "product.databook_config.update",
            resourceType: "product",
            resourceId: productId,
            summary: "Configuração técnica do produto atualizada",
        });
        revalidatePath(`/dashboard/products/${encodeURIComponent(productId)}`);
        return { success: true };
    } catch (error) {
        console.error("saveProductDatabookConfigAction:", error);
        return { success: false, error: "Erro ao salvar configuração técnica" };
    }
}

export async function listProductManualsAction(productId: string) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error, data: [] as ProductManual[] };
    const gate = await assertEntityInActiveTenant("product", productId);
    if (!gate.ok) return { success: false, error: gate.error, data: [] as ProductManual[] };
    try {
        const db = await getDb();
        const rows = await db.query<[Array<Record<string, unknown>>]>(
            "SELECT * FROM product_manual WHERE product_id = $product AND deleted_at IS NONE ORDER BY created_at ASC",
            { product: requireRecordId("product", productId) },
        );
        return {
            success: true,
            data: toPlain((rows[0] ?? []).map((row) => ({
                ...row,
                id: recordIdToString(row.id),
                product_id: recordIdToString(row.product_id),
                mime_type: "application/pdf",
            }))) as ProductManual[],
        };
    } catch (error) {
        console.error("listProductManualsAction:", error);
        return { success: false, error: "Erro ao listar manuais", data: [] as ProductManual[] };
    }
}

export async function createProductManualAction(productId: string, input: z.input<typeof manualInputSchema>) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };
    const gate = await assertEntityInActiveTenant("product", productId);
    if (!gate.ok) return { success: false, error: gate.error };
    const parsed = manualInputSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Manual inválido" };
    try {
        const db = await getDb();
        const tenantId = await requireActiveTenantId();
        const created = await db.create(new Table("product_manual")).content({
            ...parsed.data,
            product_id: requireRecordId("product", productId),
            tenant_id: tenantRecordId(tenantId),
            mime_type: "application/pdf",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
        const row = (Array.isArray(created) ? created[0] : created) as Record<string, unknown>;
        const id = recordIdToString(row.id);
        await auditTenantAction({
            action: "product.manual.create",
            resourceType: "product_manual",
            resourceId: id,
            summary: `Manual ${parsed.data.title} incluído`,
        });
        revalidatePath(`/dashboard/products/${encodeURIComponent(productId)}`);
        return { success: true, id };
    } catch (error) {
        console.error("createProductManualAction:", error);
        return { success: false, error: "Erro ao incluir manual" };
    }
}

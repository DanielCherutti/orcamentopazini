"use server";

import { revalidatePath } from "next/cache";
import { Table } from "surrealdb";
import { z } from "zod";
import { assertActionSession, assertWriteActionSession } from "@/actions/auth-actions";
import { auditTenantAction } from "@/lib/audit-log";
import { DEFAULT_TECHNICAL_TABLE_SCHEMA, technicalTableSchemaValidator } from "@/lib/databooks/domain";
import { assertEntityInActiveTenant } from "@/lib/tenant-access";
import { getDb, toPlain } from "@/lib/surreal";
import { recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";
import type { DatabookInstallation, DatabookInstallationProduct, TechnicalTableSchema } from "@/types/databook-types";

const installationSchema = z.object({
    name: z.string().trim().min(1, "O nome da instalação é obrigatório").max(300),
    code: z.string().max(100).optional(),
    location_identification: z.string().max(500).optional(),
    description: z.string().max(30000).optional(),
    installer_name: z.string().max(300).optional(),
    inspection_date: z.string().optional(),
    validity: z.string().max(100).optional(),
    inspector_name: z.string().max(300).optional(),
    general_observations: z.string().max(30000).optional(),
});

const productValuesSchema = z.record(
    z.string(),
    z.union([z.string().max(30000), z.number(), z.boolean(), z.null()]),
);

function refresh(databookId: string) {
    revalidatePath(`/dashboard/databook-documents/${encodeURIComponent(databookId)}`);
}

async function assertInstallationInDatabook(installationId: string, databookId: string) {
    const bookGate = await assertEntityInActiveTenant("databook", databookId);
    if (!bookGate.ok) return bookGate;
    const db = await getDb();
    const rows = await db.query<[Array<{ id: unknown }>]>(
        "SELECT id FROM databook_installation WHERE id = $id AND databook_id = $book AND deleted_at IS NONE LIMIT 1",
        {
            id: requireRecordId("databook_installation", installationId),
            book: requireRecordId("databook", databookId),
        },
    );
    return rows[0]?.[0] ? { ok: true as const } : { ok: false as const, error: "Instalação não encontrada" };
}

function serializeProduct(row: Record<string, unknown>): DatabookInstallationProduct {
    const product = row.product_id && typeof row.product_id === "object"
        ? row.product_id as Record<string, unknown>
        : null;
    return {
        id: recordIdToString(row.id),
        databook_installation_id: recordIdToString(row.databook_installation_id),
        product_id: product ? recordIdToString(product.id) : recordIdToString(row.product_id),
        product_code: product?.code ? String(product.code) : String((row.product_snapshot as Record<string, unknown> | undefined)?.code ?? ""),
        title: String(row.title ?? product?.description ?? ""),
        quantity: Number(row.quantity ?? 1),
        unit: row.unit ? String(row.unit) : undefined,
        suffix: row.suffix ? String(row.suffix) : undefined,
        position: Number(row.position ?? 0),
        table_schema_snapshot: row.table_schema_snapshot as TechnicalTableSchema,
        table_values: (row.table_values ?? {}) as Record<string, string | number | boolean | null>,
        product_snapshot: (row.product_snapshot ?? {}) as Record<string, unknown>,
        manual_reference_snapshot: (row.manual_reference_snapshot ?? null) as Record<string, unknown> | null,
        structural_evaluation: row.structural_evaluation ? String(row.structural_evaluation) : undefined,
        general_observations: row.general_observations ? String(row.general_observations) : undefined,
    };
}

export async function listDatabookInstallationsAction(databookId: string) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error, data: [] as DatabookInstallation[] };
    const gate = await assertEntityInActiveTenant("databook", databookId);
    if (!gate.ok) return { success: false, error: gate.error, data: [] as DatabookInstallation[] };
    try {
        const db = await getDb();
        const rows = await db.query<[Array<Record<string, unknown>>]>(
            `SELECT *, (SELECT * FROM databook_installation_product
              WHERE databook_installation_id = $parent.id AND deleted_at IS NONE
              ORDER BY position ASC, created_at ASC FETCH product_id) AS products
             FROM databook_installation WHERE databook_id = $book AND deleted_at IS NONE
             ORDER BY position ASC, created_at ASC`,
            { book: requireRecordId("databook", databookId) },
        );
        const data = (rows[0] ?? []).map((row) => ({
            id: recordIdToString(row.id),
            databook_id: recordIdToString(row.databook_id),
            name: String(row.name ?? ""),
            code: row.code ? String(row.code) : undefined,
            location_identification: row.location_identification ? String(row.location_identification) : undefined,
            description: row.description ? String(row.description) : undefined,
            installer_name: row.installer_name ? String(row.installer_name) : undefined,
            inspection_date: row.inspection_date ? String(row.inspection_date) : undefined,
            validity: row.validity ? String(row.validity) : undefined,
            inspector_name: row.inspector_name ? String(row.inspector_name) : undefined,
            general_observations: row.general_observations ? String(row.general_observations) : undefined,
            position: Number(row.position ?? 0),
            products: Array.isArray(row.products) ? row.products.map((item) => serializeProduct(item as Record<string, unknown>)) : [],
        }));
        return { success: true, data: toPlain(data) as DatabookInstallation[] };
    } catch (error) {
        console.error("listDatabookInstallationsAction:", error);
        return { success: false, error: "Erro ao listar instalações", data: [] as DatabookInstallation[] };
    }
}

export async function createDatabookInstallationAction(databookId: string, input: z.input<typeof installationSchema>) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };
    const gate = await assertEntityInActiveTenant("databook", databookId);
    if (!gate.ok) return { success: false, error: gate.error };
    const parsed = installationSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Instalação inválida" };
    try {
        const db = await getDb();
        const count = await db.query<[Array<{ count: number }>]>(
            "SELECT count() FROM databook_installation WHERE databook_id = $book AND deleted_at IS NONE GROUP ALL",
            { book: requireRecordId("databook", databookId) },
        );
        const created = await db.create(new Table("databook_installation")).content({
            ...parsed.data,
            databook_id: requireRecordId("databook", databookId),
            position: Number(count[0]?.[0]?.count ?? 0),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
        const id = recordIdToString(((Array.isArray(created) ? created[0] : created) as Record<string, unknown>).id);
        await markDatabookChanged(db, databookId);
        await auditTenantAction({ action: "databook.installation.create", resourceType: "databook_installation", resourceId: id, summary: `Instalação ${parsed.data.name} incluída` });
        refresh(databookId);
        return { success: true, id };
    } catch (error) {
        console.error("createDatabookInstallationAction:", error);
        return { success: false, error: "Erro ao incluir instalação" };
    }
}

export async function updateDatabookInstallationAction(
    databookId: string,
    installationId: string,
    input: z.input<typeof installationSchema>,
) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };
    const installationGate = await assertInstallationInDatabook(installationId, databookId);
    if (!installationGate.ok) return { success: false, error: installationGate.error };
    const parsed = installationSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Instalação inválida" };
    try {
        const db = await getDb();
        await db.update(requireRecordId("databook_installation", installationId)).merge({
            ...parsed.data,
            updated_at: new Date().toISOString(),
        });
        await markDatabookChanged(db, databookId);
        refresh(databookId);
        return { success: true };
    } catch (error) {
        console.error("updateDatabookInstallationAction:", error);
        return { success: false, error: "Erro ao salvar instalação" };
    }
}

export async function addProductToDatabookInstallationAction(databookId: string, installationId: string, productId: string) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };
    const installationGate = await assertInstallationInDatabook(installationId, databookId);
    if (!installationGate.ok) return { success: false, error: installationGate.error };
    const productGate = await assertEntityInActiveTenant("product", productId);
    if (!productGate.ok) return { success: false, error: productGate.error };
    try {
        const db = await getDb();
        const productRows = await db.query<[Array<Record<string, unknown>>, Array<Record<string, unknown>>, Array<Record<string, unknown>>]>(
            `SELECT * FROM $product LIMIT 1;
             SELECT * FROM product_databook_config WHERE product_id = $product LIMIT 1;
             SELECT * FROM product_manual WHERE product_id = $product AND active = true AND deleted_at IS NONE ORDER BY created_at ASC LIMIT 1;`,
            { product: requireRecordId("product", productId) },
        );
        const product = productRows[0]?.[0];
        if (!product) return { success: false, error: "Produto não encontrado" };
        const config = productRows[1]?.[0];
        const manual = productRows[2]?.[0];
        const count = await db.query<[Array<{ count: number }>]>(
            "SELECT count() FROM databook_installation_product WHERE databook_installation_id = $installation AND deleted_at IS NONE GROUP ALL",
            { installation: requireRecordId("databook_installation", installationId) },
        );
        const created = await db.create(new Table("databook_installation_product")).content({
            databook_installation_id: requireRecordId("databook_installation", installationId),
            product_id: requireRecordId("product", productId),
            quantity: 1,
            unit: product.unit ?? "",
            title: product.description ?? product.code ?? "Produto",
            position: Number(count[0]?.[0]?.count ?? 0),
            table_schema_snapshot: structuredClone(config?.table_schema ?? DEFAULT_TECHNICAL_TABLE_SCHEMA),
            table_values: {},
            structural_evaluation: config?.default_structural_evaluation ?? "",
            general_observations: config?.default_general_observations ?? "",
            product_snapshot: {
                id: recordIdToString(product.id),
                code: product.code ?? "",
                description: product.description ?? "",
                detailedDescription: product.detailedDescription ?? "",
                unit: product.unit ?? "",
                manufacturer: config?.manufacturer ?? "",
            },
            manual_reference_snapshot: manual ? {
                id: recordIdToString(manual.id),
                title: manual.title,
                authorship: manual.authorship,
                edition: manual.edition ?? "",
                file_url: manual.file_url,
                filename: manual.filename,
            } : null,
            source_schema_updated_at: config?.updated_at ?? null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
        const id = recordIdToString(((Array.isArray(created) ? created[0] : created) as Record<string, unknown>).id);
        await markDatabookChanged(db, databookId);
        await auditTenantAction({ action: "databook.product.add", resourceType: "databook_installation_product", resourceId: id, summary: `Produto ${String(product.description ?? product.code)} incluído no DataBook` });
        refresh(databookId);
        return { success: true, id };
    } catch (error) {
        console.error("addProductToDatabookInstallationAction:", error);
        return { success: false, error: "Erro ao incluir produto" };
    }
}

export async function updateDatabookProductValuesAction(
    databookId: string,
    itemId: string,
    input: { table_schema_snapshot: TechnicalTableSchema; table_values: Record<string, string | number | boolean | null>; structural_evaluation?: string; general_observations?: string; quantity?: number; unit?: string },
) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };
    const bookGate = await assertEntityInActiveTenant("databook", databookId);
    if (!bookGate.ok) return { success: false, error: bookGate.error };
    const schema = technicalTableSchemaValidator.safeParse(input.table_schema_snapshot);
    const values = productValuesSchema.safeParse(input.table_values);
    if (!schema.success || !values.success) return { success: false, error: "Tabela técnica inválida" };
    const quantity = Number(input.quantity ?? 1);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999999) {
        return { success: false, error: "Quantidade inválida" };
    }
    try {
        const db = await getDb();
        const ownership = await db.query<[Array<{ id: unknown }>]>(
            `SELECT id FROM databook_installation_product WHERE id = $item
             AND databook_installation_id.databook_id = $book AND deleted_at IS NONE LIMIT 1`,
            { item: requireRecordId("databook_installation_product", itemId), book: requireRecordId("databook", databookId) },
        );
        if (!ownership[0]?.[0]) return { success: false, error: "Produto da instalação não encontrado" };
        await db.update(requireRecordId("databook_installation_product", itemId)).merge({
            table_schema_snapshot: schema.data,
            table_values: values.data,
            structural_evaluation: input.structural_evaluation ?? "",
            general_observations: input.general_observations ?? "",
            quantity,
            unit: String(input.unit ?? "").trim().slice(0, 50),
            updated_at: new Date().toISOString(),
        });
        await markDatabookChanged(db, databookId);
        refresh(databookId);
        return { success: true };
    } catch (error) {
        console.error("updateDatabookProductValuesAction:", error);
        return { success: false, error: "Erro ao salvar dados técnicos" };
    }
}

export async function reorderDatabookInstallationProductsAction(
    databookId: string,
    installationId: string,
    orderedItemIds: string[],
) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };
    const installationGate = await assertInstallationInDatabook(installationId, databookId);
    if (!installationGate.ok) return { success: false, error: installationGate.error };
    if (new Set(orderedItemIds).size !== orderedItemIds.length) {
        return { success: false, error: "A ordem contém produtos duplicados" };
    }
    try {
        const db = await getDb();
        const rows = await db.query<[Array<{ id: unknown }>]>(
            `SELECT id FROM databook_installation_product
             WHERE databook_installation_id = $installation AND deleted_at IS NONE`,
            { installation: requireRecordId("databook_installation", installationId) },
        );
        const existingIds = (rows[0] ?? []).map((row) => recordIdToString(row.id)).sort();
        if (existingIds.join("|") !== [...orderedItemIds].sort().join("|")) {
            return { success: false, error: "A lista de produtos está desatualizada" };
        }
        await Promise.all(orderedItemIds.map((id, position) =>
            db.update(requireRecordId("databook_installation_product", id)).merge({
                position,
                updated_at: new Date().toISOString(),
            }),
        ));
        await markDatabookChanged(db, databookId);
        refresh(databookId);
        return { success: true };
    } catch (error) {
        console.error("reorderDatabookInstallationProductsAction:", error);
        return { success: false, error: "Erro ao ordenar produtos" };
    }
}

async function markDatabookChanged(db: Awaited<ReturnType<typeof getDb>>, databookId: string) {
    const rows = await db.query<[Array<{ current_version?: number }>]>("SELECT current_version FROM $id", {
        id: requireRecordId("databook", databookId),
    });
    await db.update(requireRecordId("databook", databookId)).merge({
        current_version: Number(rows[0]?.[0]?.current_version ?? 1) + 1,
        pdf_outdated: true,
        updated_at: new Date().toISOString(),
    });
}

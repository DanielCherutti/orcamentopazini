"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { StringRecordId, Table } from "surrealdb";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";

// Basic type for client selector (kept for backward compatibility)
export type Client = {
    id: string;
    name: string;
    email?: string;
    city?: string;
    cnpj?: string;
    details?: string;
};

export type CustomerAddress = {
    cep?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
};

export type CustomerFull = {
    id: string;
    name: string;
    cnpj?: string;
    stateRegistration?: string;
    contact?: string;
    phone?: string;
    email?: string;
    city?: string;
    address?: CustomerAddress;
};

export type CustomerFormInput = {
    name: string;
    cnpj?: string;
    stateRegistration?: string;
    contact?: string;
    phone?: string;
    email?: string;
    address?: CustomerAddress;
};

const addressSchema = z.object({
    cep: z.string().optional(),
    street: z.string().optional(),
    number: z.string().optional(),
    complement: z.string().optional(),
    neighborhood: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
}).optional();

const customerSchema = z.object({
    name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
    cnpj: z.string().optional(),
    stateRegistration: z.string().optional(),
    contact: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email("E-mail inválido").optional().or(z.literal("")),
    address: addressSchema,
});

function serializeCustomer(record: Record<string, unknown>): CustomerFull {
    if (!record) return record as unknown as CustomerFull;

    const safeId = (id: unknown): string => {
        if (!id) return "";
        if (typeof id === "string") return id;
        if (typeof id === "object" && id !== null) {
            const obj = id as Record<string, unknown>;
            const str = String(obj);
            if (str === "[object Object]" && obj.id && obj.tb) return `${obj.tb}:${obj.id}`;
            if (str !== "[object Object]") return str;
        }
        return String(id);
    };

    const rawAddress = record.address;
    let address: CustomerAddress | undefined;
    if (rawAddress && typeof rawAddress === "object" && !Array.isArray(rawAddress)) {
        const a = rawAddress as Record<string, unknown>;
        address = {
            cep: a.cep ? String(a.cep) : undefined,
            street: a.street ? String(a.street) : undefined,
            number: a.number ? String(a.number) : undefined,
            complement: a.complement ? String(a.complement) : undefined,
            neighborhood: a.neighborhood ? String(a.neighborhood) : undefined,
            city: a.city ? String(a.city) : undefined,
            state: a.state ? String(a.state) : undefined,
        };
    }

    return {
        id: safeId(record.id),
        name: String(record.name || ""),
        cnpj: record.cnpj ? String(record.cnpj) : undefined,
        stateRegistration: record.stateRegistration ? String(record.stateRegistration) : undefined,
        contact: record.contact ? String(record.contact) : undefined,
        phone: record.phone ? String(record.phone) : undefined,
        email: record.email ? String(record.email) : undefined,
        city: record.city ? String(record.city) : undefined,
        address,
    };
}

export async function searchClientsAction(query: string) {
    const db = await getDb();
    try {
        const sql = `
            SELECT * FROM client
            WHERE
                string::lowercase(name) CONTAINS string::lowercase($query)
                OR string::lowercase(email) CONTAINS string::lowercase($query)
                OR string::lowercase(city) CONTAINS string::lowercase($query)
                OR string::lowercase(cnpj) CONTAINS string::lowercase($query)
            LIMIT 10
        `;

        const result = await db.query<[Client[]]>(sql, { query });
        const data = result[0]?.map((c) => ({
            id: String(c.id),
            name: c.name,
            email: c.email,
            city: c.city,
            cnpj: c.cnpj,
            details: c.city && c.cnpj ? `${c.city} - ${c.cnpj}` : c.city || c.cnpj || ""
        })) || [];

        return { success: true, data };
    } catch (error) {
        console.error("Error searching clients:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao buscar clientes" };
    }
}

export async function listCustomersAction(params?: {
    query?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
}) {
    const db = await getDb();
    const page = params?.page || 1;
    const limit = params?.limit || 10;
    const start = (page - 1) * limit;
    const search = params?.query || "";
    const sortBy = params?.sortBy || "name";
    const sortOrder = params?.sortOrder || "asc";

    try {
        let sql = "SELECT * FROM client";
        const queryParams: Record<string, string> = {};

        if (search) {
            sql += ` WHERE string::lowercase(name) CONTAINS string::lowercase($search)
                OR string::lowercase(cnpj) CONTAINS string::lowercase($search)
                OR string::lowercase(city) CONTAINS string::lowercase($search)
                OR string::lowercase(email) CONTAINS string::lowercase($search)`;
            queryParams.search = search;
        }

        const result = await db.query<[Record<string, unknown>[]]>(sql, queryParams);
        const allCustomers = (result[0] || []).map(serializeCustomer);
        const total = allCustomers.length;

        const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
        allCustomers.sort((a, b) => {
            const aVal = a[sortBy as keyof CustomerFull] ?? "";
            const bVal = b[sortBy as keyof CustomerFull] ?? "";
            if (typeof aVal === "string" && typeof bVal === "string") {
                const cmp = collator.compare(aVal, bVal);
                return sortOrder === "asc" ? cmp : -cmp;
            }
            return 0;
        });

        const customers = allCustomers.slice(start, start + limit);

        return {
            success: true,
            data: customers,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
        };
    } catch (error) {
        console.error("Error listing customers:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao listar clientes" };
    }
}

export async function getCustomerAction(id: string) {
    const db = await getDb();
    try {
        const decodedId = decodeURIComponent(id);
        const formattedId = decodedId.startsWith("client:") ? decodedId : `client:${decodedId}`;
        const result = await db.select<Record<string, unknown>>(new StringRecordId(formattedId));
        const data = Array.isArray(result) ? result[0] : result;
        if (!data) return { success: false, error: "Cliente não encontrado" };
        return { success: true, data: serializeCustomer(data) };
    } catch (error) {
        console.error("Error fetching customer:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Cliente não encontrado" };
    }
}

export async function createCustomerAction(data: CustomerFormInput) {
    const db = await getDb();

    const validated = customerSchema.safeParse(data);
    if (!validated.success) {
        const errors = validated.error.flatten().fieldErrors;
        return { success: false, error: "Erro de validação", fieldErrors: errors };
    }

    const d = validated.data;

    try {
        if (d.cnpj) {
            const existing = await db.query<[{ id: unknown }[]]>(
                "SELECT id FROM client WHERE cnpj = $cnpj",
                { cnpj: d.cnpj }
            );
            if (existing[0] && existing[0].length > 0) {
                return {
                    success: false,
                    error: "CNPJ já cadastrado",
                    fieldErrors: { cnpj: ["CNPJ já cadastrado"] },
                };
            }
        }

        await db.create(new Table("client")).content({
            name: d.name,
            cnpj: d.cnpj || null,
            stateRegistration: d.stateRegistration || null,
            contact: d.contact || null,
            phone: d.phone || null,
            email: d.email || null,
            city: d.address?.city || null,
            address: d.address || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });

        revalidatePath("/customers");
        return { success: true };
    } catch (error) {
        console.error("Error creating customer:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao criar cliente" };
    }
}

export async function updateCustomerAction(id: string, data: CustomerFormInput) {
    const db = await getDb();

    const validated = customerSchema.safeParse(data);
    if (!validated.success) {
        const errors = validated.error.flatten().fieldErrors;
        return { success: false, error: "Erro de validação", fieldErrors: errors };
    }

    const d = validated.data;
    const decodedId = decodeURIComponent(id);
    const formattedId = decodedId.startsWith("client:") ? decodedId : `client:${decodedId}`;

    try {
        if (d.cnpj) {
            const existing = await db.query<[{ id: unknown }[]]>(
                "SELECT id FROM client WHERE cnpj = $cnpj AND id != $id",
                { cnpj: d.cnpj, id: new StringRecordId(formattedId) }
            );
            if (existing[0] && existing[0].length > 0) {
                return {
                    success: false,
                    error: "CNPJ já cadastrado",
                    fieldErrors: { cnpj: ["CNPJ já cadastrado"] },
                };
            }
        }

        await db.update(new StringRecordId(formattedId)).merge({
            name: d.name,
            cnpj: d.cnpj || null,
            stateRegistration: d.stateRegistration || null,
            contact: d.contact || null,
            phone: d.phone || null,
            email: d.email || null,
            city: d.address?.city || null,
            address: d.address || null,
            updated_at: new Date().toISOString(),
        });

        revalidatePath("/customers");
        return { success: true };
    } catch (error) {
        console.error("Error updating customer:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao atualizar cliente" };
    }
}

export async function deleteCustomerAction(id: string) {
    const db = await getDb();
    try {
        const decodedId = decodeURIComponent(id);
        const formattedId = decodedId.startsWith("client:") ? decodedId : `client:${decodedId}`;

        const refs = await db.query<[{ id: unknown }[]]>(
            "SELECT id FROM budget WHERE client = $id LIMIT 1",
            { id: new StringRecordId(formattedId) }
        );
        if (refs[0] && refs[0].length > 0) {
            return {
                success: false,
                error: "Cliente possui orçamentos vinculados e não pode ser excluído",
            };
        }

        await db.delete(new StringRecordId(formattedId));
        revalidatePath("/customers");
        return { success: true };
    } catch (error) {
        console.error("Error deleting customer:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao excluir cliente" };
    }
}

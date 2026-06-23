import { NextResponse } from "next/server";
import type { Surreal } from "surrealdb";
import { assertBudgetBelongsToTenant } from "@/lib/budget-tenant";
import { assertEntityBelongsToTenant } from "@/lib/tenant-access";

export function tenantGateResponse(error: string, status = 404): NextResponse {
    return NextResponse.json({ error }, { status });
}

export async function requireProductInTenant(
    productId: string,
    tenantId: string,
    db?: Surreal,
): Promise<NextResponse | null> {
    const gate = await assertEntityBelongsToTenant(
        "product",
        productId,
        tenantId,
        "Produto não encontrado",
        db,
    );
    if (!gate.ok) return tenantGateResponse(gate.error);
    return null;
}

export async function requireBudgetInTenant(
    budgetId: string,
    tenantId: string,
    db?: Surreal,
): Promise<NextResponse | null> {
    const gate = await assertBudgetBelongsToTenant(budgetId, tenantId, db);
    if (!gate.ok) return tenantGateResponse(gate.error);
    return null;
}

/** Normaliza id de rota (ex.: product:abc ou product_abc). */
export function normalizeRouteRecordId(raw: string, table: string): string {
    const trimmed = raw.trim();
    if (trimmed.includes(":")) return trimmed;
    return `${table}:${trimmed.replace(/^product_/, "").replace(/^budget_/, "")}`;
}

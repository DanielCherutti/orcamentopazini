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

export async function requireTechnicalEquipmentInTenant(
    equipmentId: string,
    tenantId: string,
    db?: Surreal,
): Promise<NextResponse | null> {
    const gate = await assertEntityBelongsToTenant(
        "technical_equipment",
        equipmentId,
        tenantId,
        "Equipamento não encontrado",
        db,
    );
    if (!gate.ok) return tenantGateResponse(gate.error);
    return null;
}

export async function requireDeliveryProjectInTenant(
    projectId: string,
    tenantId: string,
    db?: Surreal,
): Promise<NextResponse | null> {
    const gate = await assertEntityBelongsToTenant(
        "delivery_project",
        projectId,
        tenantId,
        "Projeto de entrega não encontrado",
        db,
    );
    if (!gate.ok) return tenantGateResponse(gate.error);
    return null;
}

export async function requireDatabookTemplateInTenant(
    templateId: string,
    tenantId: string,
    db?: Surreal,
): Promise<NextResponse | null> {
    const gate = await assertEntityBelongsToTenant(
        "databook_template",
        templateId,
        tenantId,
        "DataBook não encontrado",
        db,
    );
    if (!gate.ok) return tenantGateResponse(gate.error);
    return null;
}

/** Normaliza id de rota (ex.: product:abc ou product_abc). */
export function normalizeRouteRecordId(raw: string, table: string): string {
    const trimmed = raw.trim();
    if (trimmed.includes(":")) return trimmed;
    return `${table}:${trimmed
        .replace(/^product_/, "")
        .replace(/^budget_/, "")
        .replace(/^technical_equipment_/, "")
        .replace(/^delivery_project_/, "")
        .replace(/^databook_template_/, "")}`;
}

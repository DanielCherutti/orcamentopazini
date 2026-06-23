"use server";

import { Table } from "surrealdb";
import { revalidatePath } from "next/cache";
import { StringRecordId } from "surrealdb";
import { assertWriteActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { InvalidRecordIdError, recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";
import {
    duplicateBudgetStructure,
    recalculateBudgetTotalValue,
    updateCoverRevisionLabel,
} from "@/actions/budget-core-duplicate-internals";
import { canCreateBudgetRevision, isBudgetEditableStatus } from "@/lib/budgets/budget-status";
import {
    formatBudgetRevisionLabel,
    stripBudgetRevisionTitleSuffix,
} from "@/lib/budgets/budget-revision";
import { assertBudgetInActiveTenant } from "@/lib/budget-tenant";
import { requireActiveTenantId, tenantRecordId } from "@/lib/tenant-query";
import { auditTenantAction } from "@/lib/audit-log";

function resolveRelationId(value: unknown): string {
    if (!value) return "";
    if (typeof value === "object" && value !== null && "id" in (value as Record<string, unknown>)) {
        return String((value as Record<string, unknown>).id);
    }
    return String(value);
}

async function getNextRevisionNumber(
    db: Awaited<ReturnType<typeof getDb>>,
    rootBudgetRecordId: StringRecordId,
    proposalCode?: string | null
): Promise<number> {
    let max = 0;

    const bump = (value: unknown) => {
        const n = Number(value ?? 0);
        if (Number.isFinite(n) && n > max) max = n;
    };

    if (proposalCode) {
        const byCode = await db.query<[Array<{ max_rev?: number }>]>(
            `SELECT math::max(revision_number) AS max_rev FROM budget
             WHERE code = $code AND revision_number IS NOT NONE
             GROUP ALL`,
            { code: proposalCode }
        );
        bump(byCode?.[0]?.[0]?.max_rev);
    }

    const byRoot = await db.query<[Array<{ revision_number?: number }>]>(
        `SELECT revision_number FROM budget
         WHERE root_budget_id = $rootId OR id = $rootId`,
        { rootId: rootBudgetRecordId }
    );
    for (const row of byRoot?.[0] || []) {
        bump(row.revision_number);
    }

    const rootNorm = recordIdToString(rootBudgetRecordId);
    const allWithRev = await db.query<
        [Array<{ revision_number?: number; root_budget_id?: unknown }>]
    >(`SELECT revision_number, root_budget_id FROM budget WHERE revision_number IS NOT NONE`);
    for (const row of allWithRev?.[0] || []) {
        if (recordIdToString(row.root_budget_id) === rootNorm) {
            bump(row.revision_number);
        }
    }

    return max + 1;
}

/** Última versão finalizada da proposta (para copiar conteúdo ao criar revisão a partir da raiz). */
async function resolveRevisionSourceBudget(
    db: Awaited<ReturnType<typeof getDb>>,
    clickedRecordId: StringRecordId,
    clicked: Record<string, unknown>
): Promise<{ sourceRecordId: StringRecordId; source: Record<string, unknown> }> {
    if (clicked.parent_budget_id) {
        return { sourceRecordId: clickedRecordId, source: clicked };
    }

    const rootBudgetId = resolveRelationId(clicked.root_budget_id) || String(clicked.id);
    const rootBudgetRecordId = requireRecordId("budget", rootBudgetId);

    const familyRes = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM budget WHERE id = $rootId OR root_budget_id = $rootId`,
        { rootId: rootBudgetRecordId }
    );
    const family = familyRes?.[0] || [];

    const candidates = family.filter(
        (row) =>
            !isBudgetEditableStatus(String(row.status)) &&
            canCreateBudgetRevision(String(row.status))
    );

    if (candidates.length === 0) {
        return { sourceRecordId: clickedRecordId, source: clicked };
    }

    candidates.sort(
        (a, b) => Number(b.revision_number ?? 0) - Number(a.revision_number ?? 0)
    );
    const latest = candidates[0];
    const latestId = String(latest.id);
    return {
        sourceRecordId: requireRecordId("budget", latestId),
        source: latest,
    };
}

async function familyHasDraftRevision(
    db: Awaited<ReturnType<typeof getDb>>,
    rootBudgetRecordId: StringRecordId
): Promise<boolean> {
    const familyRes = await db.query<[Array<{ status?: string }>]>(
        `SELECT status FROM budget WHERE id = $rootId OR root_budget_id = $rootId`,
        { rootId: rootBudgetRecordId }
    );
    return (familyRes?.[0] || []).some((row) => isBudgetEditableStatus(String(row.status)));
}

/** Indica se este orçamento pode originar uma nova revisão (ex.: aba E-mail). */
export async function canCreateBudgetRevisionForBudgetAction(
    budgetId: string
): Promise<{ success: boolean; canCreate?: boolean; hint?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, hint: auth.error };

    const gate = await assertBudgetInActiveTenant(budgetId);
    if (!gate.ok) return { success: false, hint: gate.error };

    const db = await getDb();
    try {
        const budgetRecordId = gate.budgetRecordId;
        const res = await db.query<
            [Array<{ status?: string; parent_budget_id?: unknown; root_budget_id?: unknown; id?: unknown }>]
        >("SELECT status, parent_budget_id, root_budget_id, id FROM $id", {
            id: budgetRecordId,
        });
        const row = res[0]?.[0];
        if (!row) {
            return { success: true, canCreate: false, hint: "Orçamento não encontrado." };
        }

        if (!canCreateBudgetRevision(String(row.status))) {
            return {
                success: true,
                canCreate: false,
                hint: "Finalize o orçamento antes de criar uma revisão.",
            };
        }

        if (row.parent_budget_id) {
            return {
                success: true,
                canCreate: false,
                hint: "Crie a revisão a partir do orçamento principal da proposta.",
            };
        }

        const rootBudgetId = resolveRelationId(row.root_budget_id) || String(row.id);
        const rootBudgetRecordId = requireRecordId("budget", rootBudgetId);
        if (await familyHasDraftRevision(db, rootBudgetRecordId)) {
            return {
                success: true,
                canCreate: false,
                hint: "Já existe uma revisão em andamento nesta proposta.",
            };
        }

        return { success: true, canCreate: true };
    } catch (e) {
        if (e instanceof InvalidRecordIdError) {
            return { success: false, hint: e.message };
        }
        if (isTokenExpiredError(e)) resetDb();
        return { success: false, hint: "Não foi possível verificar revisões." };
    }
}

/**
 * Cria revisão editável (`draft`) a partir de orçamento finalizado (ou outro status fechado).
 * Mantém o mesmo `code` da proposta e encadeia `parent_budget_id` / `root_budget_id`.
 */
export async function createBudgetRevisionAction(
    budgetId: string
): Promise<{ success: boolean; newBudgetId?: string; revisionNumber?: number; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetInActiveTenant(budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const budgetRecordId = gate.budgetRecordId;
        const tenantId = await requireActiveTenantId();

        const originalRes = await db.query<[Array<Record<string, unknown>>]>("SELECT * FROM $id", {
            id: budgetRecordId,
        });
        const original = originalRes[0]?.[0];
        if (!original) return { success: false, error: "Orçamento não encontrado" };

        if (isBudgetEditableStatus(String(original.status))) {
            return {
                success: false,
                error: "Finalize o orçamento antes de criar uma revisão.",
            };
        }

        const rootBudgetId = resolveRelationId(original.root_budget_id) || String(original.id);
        const rootBudgetRecordId = requireRecordId("budget", rootBudgetId);

        if (await familyHasDraftRevision(db, rootBudgetRecordId)) {
            return {
                success: false,
                error: "Já existe uma revisão em andamento. Finalize ou exclua antes de criar outra.",
            };
        }

        const { sourceRecordId, source } = await resolveRevisionSourceBudget(
            db,
            budgetRecordId,
            original
        );

        if (!canCreateBudgetRevision(String(source.status))) {
            return { success: false, error: "Não é possível criar revisão deste orçamento." };
        }

        const useCompositor = !!source.use_compositor;
        const proposalCode = source.code ? String(source.code) : null;
        const revisionNumber = await getNextRevisionNumber(db, rootBudgetRecordId, proposalCode);
        const revisionLabel = formatBudgetRevisionLabel(revisionNumber);
        const baseTitle = stripBudgetRevisionTitleSuffix(
            String(source.title || source.code || "Orçamento").trim()
        );
        const newTitle = `${baseTitle} — ${revisionLabel}`;

        const clientId = resolveRelationId(source.client_id);

        const newBudgetRaw = await db.create(new Table("budget")).content({
            title: newTitle,
            code: source.code,
            status: "draft",
            total_value: 0,
            client_id: clientId,
            tenant_id: tenantRecordId(tenantId),
            use_compositor: useCompositor,
            compositor_label: source.compositor_label,
            description: source.description,
            payment_terms: source.payment_terms,
            delivery_time: source.delivery_time,
            validity_days: source.validity_days,
            issue_date: source.issue_date,
            section_number: source.section_number,
            show_costs_on_print: source.show_costs_on_print ?? false,
            costs_display_mode: source.costs_display_mode ?? "section",
            quote_markup_percent: source.quote_markup_percent,
            quote_discount_percent: source.quote_discount_percent,
            quote_markup_equipment_percent: source.quote_markup_equipment_percent,
            quote_discount_equipment_percent: source.quote_discount_equipment_percent,
            quote_markup_assembly_percent: source.quote_markup_assembly_percent,
            quote_discount_assembly_percent: source.quote_discount_assembly_percent,
            quote_show_sections: source.quote_show_sections,
            quote_note_above: source.quote_note_above,
            quote_note_below: source.quote_note_below,
            parent_budget_id: sourceRecordId,
            root_budget_id: rootBudgetRecordId,
            revision_number: revisionNumber,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
        const newBudget = Array.isArray(newBudgetRaw) ? newBudgetRaw[0] : newBudgetRaw;
        const newBudgetId = String(newBudget.id);
        const newBudgetRecordId = new StringRecordId(newBudgetId);

        await duplicateBudgetStructure(db, sourceRecordId, newBudgetRecordId, useCompositor);
        await recalculateBudgetTotalValue(db, newBudgetRecordId, useCompositor);

        if (useCompositor) {
            await updateCoverRevisionLabel(db, newBudgetRecordId, revisionLabel);
        }

        revalidatePath("/budgets");
        await auditTenantAction({
            action: "budget.revision_create",
            resourceType: "budget",
            resourceId: newBudgetId,
            summary: `Revisão ${revisionNumber} criada a partir de ${budgetId}`,
            metadata: { sourceBudgetId: budgetId, revisionNumber },
        });
        return { success: true, newBudgetId, revisionNumber };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error creating budget revision:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao criar revisão do orçamento" };
    }
}

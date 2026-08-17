import assert from "node:assert/strict";
import test from "node:test";
import {
    isActiveBudgetRecord,
    onlyActiveBudgetRecords,
} from "@/lib/budgets/active-budget-records";

test("considera ativos registros sem marcador de exclusão", () => {
    assert.equal(isActiveBudgetRecord({ id: "budget_section:active" }), true);
    assert.equal(isActiveBudgetRecord({ id: "budget_section:null", deleted_at: null }), true);
});

test("impede que tombstones sejam materializados por fluxos de cópia", () => {
    const active = { id: "budget_section:active", deleted_at: null };
    const deleted = {
        id: "budget_section:deleted",
        deleted_at: "2026-08-17T12:00:00.000Z",
    };

    assert.equal(isActiveBudgetRecord(deleted), false);
    assert.deepEqual(onlyActiveBudgetRecords([active, deleted]), [active]);
});

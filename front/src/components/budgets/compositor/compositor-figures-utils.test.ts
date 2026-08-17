import assert from "node:assert/strict";
import test from "node:test";
import type { BudgetBlock } from "@/types/budget-compositor-types";
import { buildFiguresListModel } from "./compositor-figures-utils";

test("figure list preserves an optional empty caption without artificial description", () => {
    const rows = buildFiguresListModel(
        [{ id: "budget_image:one", caption: "" }],
        [
            {
                id: "budget_block:figures",
                budget_id: "budget:test",
                parent_id: null,
                type: "figures",
                label: "Lista de figuras",
                order_index: 0,
                props: {},
                created_at: "2026-08-17T00:00:00.000Z",
                updated_at: "2026-08-17T00:00:00.000Z",
                children: [],
                number: "",
                depth: 0,
            } satisfies BudgetBlock,
        ],
        {},
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].caption, "");
});

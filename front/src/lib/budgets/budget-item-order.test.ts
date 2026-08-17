import assert from "node:assert/strict";
import test from "node:test";
import type { BudgetItem } from "@/types/budget-types";
import { orderBudgetItemsForPdf } from "./budget-item-order";

function item(id: string, order_index?: number): BudgetItem {
    return {
        id,
        product_id: `product:${id}`,
        quantity: 1,
        unit_price: 0,
        labor_cost: 0,
        total: 0,
        order_index,
    } as BudgetItem;
}

test("orders PDF products by the compositor order_index", () => {
    const reversedFromDatabase = [item("0014", 40), item("0015", 30), item("0002", 20), item("0100", 10), item("0009", 0)];

    assert.deepEqual(
        orderBudgetItemsForPdf(reversedFromDatabase).map((entry) => entry.id),
        ["0009", "0100", "0002", "0015", "0014"]
    );
});

test("keeps a stable order for equal or missing legacy indexes", () => {
    const entries = [item("first"), item("second", 10), item("third", 10), item("fourth")];

    assert.deepEqual(
        orderBudgetItemsForPdf(entries).map((entry) => entry.id),
        ["second", "third", "first", "fourth"]
    );
});

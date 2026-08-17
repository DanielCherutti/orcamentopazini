import assert from "node:assert/strict";
import test from "node:test";
import type { BudgetItem } from "@/types/budget-types";
import {
    buildItemSegments,
    getBudgetItemGroupSegmentKey,
    moveItemAfterGroupMembers,
} from "./item-group-segment";

function item(id: string, extra: Partial<BudgetItem> = {}): BudgetItem {
    return {
        id,
        product_id: `product:${id}`,
        quantity: 1,
        unit_price: 0,
        labor_cost: 0,
        total: 0,
        ...extra,
    } as BudgetItem;
}

test("groups temporary budget items without a catalog group", () => {
    const first = item("one", { group_name: "Kit temporário", group_instance_id: "instance-1" });
    const second = item("two", { group_name: "Kit temporário", group_instance_id: "instance-1" });

    assert.equal(getBudgetItemGroupSegmentKey(first), "temporary:::instance-1");
    assert.deepEqual(buildItemSegments([first, second]), [
        {
            type: "group",
            id: "temporary:::instance-1",
            name: "Kit temporário",
            items: [first, second],
        },
    ]);
});

test("keeps items without complete temporary-group metadata standalone", () => {
    const withoutName = item("one", { group_instance_id: "instance-1" });
    const withoutInstance = item("two", { group_name: "Grupo incompleto" });

    assert.equal(getBudgetItemGroupSegmentKey(withoutName), null);
    assert.equal(getBudgetItemGroupSegmentKey(withoutInstance), null);
    assert.equal(buildItemSegments([withoutName, withoutInstance]).length, 2);
});

test("moves a standalone item to the end of an existing group", () => {
    assert.deepEqual(
        moveItemAfterGroupMembers(["outside", "g1", "g2", "tail"], "outside", ["g1", "g2"]),
        ["g1", "g2", "outside", "tail"],
    );
});

test("moves an ungrouped item after its former group without splitting it", () => {
    assert.deepEqual(
        moveItemAfterGroupMembers(["g1", "leaving", "g2", "tail"], "leaving", ["g1", "g2"]),
        ["g1", "g2", "leaving", "tail"],
    );
});

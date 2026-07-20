import assert from "node:assert/strict";
import test from "node:test";
import { computeItemSubtotal, normalizeQty } from "./scope-pricing";

test("preserves positive fractional product quantities", () => {
    assert.equal(normalizeQty(0.8), 0.8);
    assert.equal(
        computeItemSubtotal({ quantity: 0.8, unit_price: 1000, labor_cost: 0 }),
        800,
    );
});

test("rejects non-positive quantities in pricing normalization", () => {
    assert.equal(normalizeQty(0), 1);
    assert.equal(normalizeQty(-0.8), 1);
    assert.equal(normalizeQty(Number.NaN), 1);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
    applyGeneralPriceAdjustment,
    applyQuoteCommercialFactor,
    computeItemSubtotal,
    computeLocationQuoteBreakdown,
    computeLocationScopeTotal,
    computeSectionCostSummary,
    normalizeQty,
} from "./scope-pricing";

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

test("applies Vara percentage to the value displayed in budget details", () => {
    assert.equal(applyQuoteCommercialFactor(9475.2, 20, 0), 11370.24);
});

test("applies Vara before the commercial discount", () => {
    assert.equal(applyQuoteCommercialFactor(1000, 20, 10), 1080);
});

test("accepts negative general adjustments as discounts", () => {
    assert.equal(
        applyGeneralPriceAdjustment(1000, {
            general_price_adjustment_mode: "percent",
            general_price_adjustment_value: -10,
        }),
        900,
    );
    assert.equal(
        applyGeneralPriceAdjustment(1000, {
            general_price_adjustment_mode: "fixed",
            general_price_adjustment_value: -250,
        }),
        750,
    );
    assert.equal(
        applyGeneralPriceAdjustment(100, {
            general_price_adjustment_mode: "fixed",
            general_price_adjustment_value: -150,
        }),
        0,
    );
});

test("stacks section and location adjustments without changing assembly", () => {
    const params = {
        location: {
            assembly_mode: "fixed" as const,
            assembly_value: 100,
            general_price_adjustment_mode: "percent" as const,
            general_price_adjustment_value: -10,
        },
        sections: [
            {
                id: "budget_section:one",
                general_price_adjustment_mode: "fixed" as const,
                general_price_adjustment_value: 100,
            },
        ],
        items: [
            {
                id: "budget_item:one",
                section_id: "budget_section:one",
                quantity: 1,
                unit_price: 1000,
            },
        ],
    };

    assert.equal(computeLocationScopeTotal(params), 1090);
    assert.deepEqual(computeLocationQuoteBreakdown(params), {
        collapsedEquipment: 990,
        collapsedAssembly: 100,
        scopeTotal: 1090,
        sectionRows: [
            { sectionId: "budget_section:one", equipment: 990, assembly: 100 },
        ],
    });
});

test("separates section equipment, assembly and combined totals", () => {
    const summary = computeSectionCostSummary(
        [
            {
                id: "item:one",
                quantity: 2,
                unit_price: 100,
                labor_cost: 10,
                price_adjustment_mode: "percent",
                price_adjustment_value: 10,
                observation_extra_value: 8,
            },
        ],
        { "item:one": 50 },
        20,
        10,
    );

    assert.deepEqual(summary, {
        equipment: 270,
        assembly: 54,
        total: 324,
    });
});

test("includes the section general discount in its displayed summary", () => {
    const summary = computeSectionCostSummary(
        [{ id: "item:one", quantity: 1, unit_price: 1000 }],
        { "item:one": 100 },
        0,
        0,
        {
            general_price_adjustment_mode: "percent",
            general_price_adjustment_value: -10,
        },
    );

    assert.deepEqual(summary, { equipment: 900, assembly: 100, total: 1000 });
});

test("keeps a fixed section assembly value when the section has no products", () => {
    const summary = computeSectionCostSummary([], {}, 0, 0, null, 1250);
    assert.deepEqual(summary, { equipment: 0, assembly: 1250, total: 1250 });

    const breakdown = computeLocationQuoteBreakdown({
        location: { assembly_mode: "percent", assembly_value: 0 },
        sections: [
            {
                id: "budget_section:assembly-only",
                assembly_mode: "fixed",
                assembly_value: 1250,
            },
        ],
        items: [],
    });
    assert.deepEqual(breakdown, {
        collapsedEquipment: 0,
        collapsedAssembly: 1250,
        scopeTotal: 1250,
        sectionRows: [
            {
                sectionId: "budget_section:assembly-only",
                equipment: 0,
                assembly: 1250,
            },
        ],
    });
});

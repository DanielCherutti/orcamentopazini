/**
 * Regressão rápida dos totais da aba Orçamento (sem DB).
 * Uso: npm run test:quote-breakdown
 */
import {
    computeItemSubtotal,
    computeLocationQuoteBreakdown,
} from "../src/lib/budgets/scope-pricing";

function assertApprox(a: number, b: number, label: string) {
    if (Math.abs(a - b) > 1e-5) {
        throw new Error(`${label}: esperado ${b}, obtido ${a}`);
    }
}

const item = {
    section_id: "sec1",
    quantity: 1,
    unit_price: 100,
    labor_cost: 0,
    price_adjustment_mode: null as const,
    price_adjustment_value: 0,
    observation_extra_value: 0,
    assembly_manual_value: 0,
};

const sub = computeItemSubtotal(item);

const oneSection = computeLocationQuoteBreakdown({
    location: { assembly_mode: "percent", assembly_value: 10 },
    sections: [{ id: "sec1" }],
    items: [item],
});

assertApprox(oneSection.collapsedEquipment, sub, "1 trecho / equipamento");
assertApprox(oneSection.collapsedAssembly, sub * 0.1, "1 trecho / montagem");

const twoSections = computeLocationQuoteBreakdown({
    location: { assembly_mode: "percent", assembly_value: 10 },
    sections: [{ id: "sec1" }, { id: "sec2" }],
    items: [
        item,
        {
            section_id: "sec2",
            quantity: 2,
            unit_price: 50,
            labor_cost: 0,
            price_adjustment_mode: null,
            price_adjustment_value: 0,
            observation_extra_value: 0,
            assembly_manual_value: 0,
        },
    ],
});

const sub2 = computeItemSubtotal({
    quantity: 2,
    unit_price: 50,
    labor_cost: 0,
    price_adjustment_mode: null,
    price_adjustment_value: 0,
    observation_extra_value: 0,
    assembly_manual_value: 0,
});
const totalEq = sub + sub2;
assertApprox(twoSections.collapsedEquipment, totalEq, "2 trechos / equipamento total");
assertApprox(twoSections.collapsedAssembly, totalEq * 0.1, "2 trechos / montagem total");

console.log("quote-breakdown-regression: OK");

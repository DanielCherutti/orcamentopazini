import assert from "node:assert/strict";
import test from "node:test";
import React, { type ReactNode } from "react";
import type { BudgetItem, BudgetLocation } from "@/types/budget-types";
import {
    BudgetTable,
    computeLocationItemValues,
    SectionItemsTable,
} from "./budget-table";

function collectRenderedText(node: ReactNode): string {
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(collectRenderedText).join(" ");
    if (!React.isValidElement<{ children?: ReactNode }>(node)) return "";
    return collectRenderedText(node.props.children);
}

test("PDF detail applies the equipment Vara percentage to item and section values", () => {
    const location = {
        id: "budget_location:test",
        name: "Escada marinheiro",
        order_index: 0,
        assembly_mode: "percent",
        assembly_value: 0,
        sections: [
            {
                id: "budget_section:test",
                name: "Linhas de vida - silos",
                order_index: 0,
                items: [
                    {
                        id: "budget_item:test",
                        product_id: "product:test",
                        quantity: 1,
                        unit_price: 9475.2,
                        labor_cost: 0,
                        total: 9475.2,
                    },
                ],
            },
        ],
    } as BudgetLocation;

    const { itemFinalValue } = computeLocationItemValues(location, 20, 0);

    assert.equal(itemFinalValue.get("budget_item:test"), 11370.24);
});

test("PDF detail applies equipment and assembly percentages independently", () => {
    const location = {
        id: "budget_location:split-percentages",
        name: "Local",
        order_index: 0,
        assembly_mode: "fixed",
        assembly_value: 100,
        sections: [
            {
                id: "budget_section:split-percentages",
                name: "Trecho",
                order_index: 0,
                items: [
                    {
                        id: "budget_item:split-percentages",
                        product_id: "product:test",
                        quantity: 1,
                        unit_price: 1000,
                        labor_cost: 0,
                        total: 1000,
                    },
                ],
            },
        ],
    } as BudgetLocation;

    const { itemFinalValue } = computeLocationItemValues(location, 20, 0, 10, 0);

    assert.equal(itemFinalValue.get("budget_item:split-percentages"), 1310);
});

test("PDF detail prints the location header even when the location has no images", () => {
    const location = {
        id: "budget_location:tunnel",
        name: "Túnel dos silos",
        order_index: 0,
        assembly_mode: "percent",
        assembly_value: 0,
        sections: [
            {
                id: "budget_section:tunnel",
                name: "Trecho principal",
                order_index: 0,
                items: [],
                images: [],
            },
        ],
        images: [],
    } as BudgetLocation;

    const tree = BudgetTable({ locations: [location], sectionNumber: 4 });
    const renderedText = collectRenderedText(tree);

    assert.match(renderedText, /4\.1 — Túnel dos silos/);
    assert.match(renderedText, /4\.1\.1 — TRECHO PRINCIPAL/);
});

test("PDF detail preserves visible product groups with header and footer", () => {
    const makeItem = (id: string, code: string, extra: Partial<BudgetItem> = {}) =>
        ({
            id,
            product_id: `product:${id}`,
            product_code: code,
            product_name: `Produto ${code}`,
            quantity: 1,
            unit_price: 10,
            labor_cost: 0,
            total: 10,
            ...extra,
        }) as BudgetItem;
    const items = [
        makeItem("outside", "0001", { order_index: 0 }),
        makeItem("group-one", "0002", {
            order_index: 10,
            group_id: "product_group:kit",
            group_name: "Kit espaço confinado",
            group_instance_id: "instance-1",
        }),
        makeItem("group-two", "0003", {
            order_index: 20,
            group_id: "product_group:kit",
            group_name: "Kit espaço confinado",
            group_instance_id: "instance-1",
        }),
    ];

    const tree = SectionItemsTable({
        sec: { id: "budget_section:test", items },
        showCosts: false,
        laborCols: false,
        costsDisplayMode: "section",
        itemFinalValue: new Map(),
    });
    const renderedText = collectRenderedText(tree);

    assert.match(renderedText, /KIT ESPAÇO CONFINADO/);
    assert.match(renderedText, /FIM DO GRUPO/);
    assert.ok(renderedText.indexOf("0002") < renderedText.indexOf("0003"));
});

import assert from "node:assert/strict";
import test from "node:test";
import { isValidNcm, normalizeNcm } from "./ncm";
import {
    parseTemporaryProductInput,
    temporaryProductInputFromBudgetItem,
} from "./temporary-product";
import type { BudgetItem } from "@/types/budget-types";

test("normalizes NCM to eight numeric digits", () => {
    assert.equal(normalizeNcm("7308.90.90"), "73089090");
    assert.equal(normalizeNcm(" 12a34-567890 "), "12345678");
});

test("requires exactly eight digits for NCM", () => {
    assert.equal(isValidNcm("73089090"), true);
    assert.equal(isValidNcm("7308909"), false);
    assert.equal(isValidNcm("7308.90.90"), false);
});

test("temporary products also require NCM", () => {
    const base = {
        code: "TMP-1",
        description: "Produto temporário",
        unit: "UN",
        equipmentPrice: 10,
        assemblyPrice: 0,
        assemblyPriceType: "fixed" as const,
    };

    assert.equal(parseTemporaryProductInput({ ...base, ncm: "73089090" }).ok, true);
    const invalid = parseTemporaryProductInput({ ...base, ncm: "" });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.deepEqual(invalid.fieldErrors?.ncm, ["O NCM deve conter exatamente 8 dígitos"]);
});

test("rebuilds temporary product editing values from product data and item prices", () => {
    const item = {
        id: "budget_item:temporary",
        product_id: "product:temporary",
        product_name: "Snapshot antigo",
        product_code: "TMP-OLD",
        product_ncm: "00000000",
        product_unit: "UN",
        quantity: 2,
        unit_price: 150,
        labor_cost: 25,
        total: 350,
        product_data: {
            code: "TMP-EDIT",
            ncm: "73089090",
            description: "Produto temporário editável",
            unit: "M",
            is_temporary: true,
            assemblyPriceType: "percentage",
            assemblyPricePercentage: 10,
            detailedDescription: "Detalhes",
            imageUrl: "/imagem.png",
        },
    } as unknown as BudgetItem;

    assert.deepEqual(temporaryProductInputFromBudgetItem(item), {
        code: "TMP-EDIT",
        ncm: "73089090",
        description: "Produto temporário editável",
        unit: "M",
        equipmentPrice: 150,
        assemblyPrice: 25,
        assemblyPriceType: "percentage",
        assemblyPricePercentage: 10,
        detailedDescription: "Detalhes",
        imageUrl: "/imagem.png",
    });
});

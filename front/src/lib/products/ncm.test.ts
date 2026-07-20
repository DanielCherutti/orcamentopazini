import assert from "node:assert/strict";
import test from "node:test";
import { isValidNcm, normalizeNcm } from "./ncm";
import { parseTemporaryProductInput } from "./temporary-product";

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

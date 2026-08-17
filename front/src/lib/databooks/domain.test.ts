import assert from "node:assert/strict";
import test from "node:test";
import {
    DEFAULT_TECHNICAL_TABLE_SCHEMA,
    alphabeticReference,
    attachmentKindForAuthorship,
    consolidateManuals,
    estimateRemainingTime,
    hierarchicalInstallationNumber,
    technicalTableSchemaValidator,
} from "@/lib/databooks/domain";
import type { ProductManual } from "@/types/databook-types";

test("numera instalações e produtos pela ordem, com sufixo opcional", () => {
    assert.equal(hierarchicalInstallationNumber(0), "1");
    assert.equal(hierarchicalInstallationNumber(2, 0), "3.1");
    assert.equal(hierarchicalInstallationNumber(2, 0, "7"), "3.1.7");
});

test("gera letras após Z", () => {
    assert.equal(alphabeticReference(0), "A");
    assert.equal(alphabeticReference(25), "Z");
    assert.equal(alphabeticReference(26), "AA");
    assert.equal(alphabeticReference(27), "AB");
});

test("classifica autoria e deduplica o mesmo manual/edição", () => {
    assert.equal(attachmentKindForAuthorship("internal"), "appendix");
    assert.equal(attachmentKindForAuthorship("external"), "annex");
    const base: ProductManual = {
        id: "product_manual:a",
        product_id: "product:a",
        title: "Manual",
        file_url: "/api/uploads/manual.pdf",
        filename: "manual.pdf",
        mime_type: "application/pdf",
        authorship: "internal",
        edition: "1",
        active: true,
    };
    const consolidated = consolidateManuals([
        base,
        base,
        { ...base, id: "product_manual:b", authorship: "external" },
    ]);
    assert.deepEqual(consolidated.map((item) => item.reference), ["Apêndice A", "Anexo A"]);
});

test("valida o schema padrão e rejeita células sobrepostas", () => {
    assert.equal(technicalTableSchemaValidator.safeParse(DEFAULT_TECHNICAL_TABLE_SCHEMA).success, true);
    const invalid = structuredClone(DEFAULT_TECHNICAL_TABLE_SCHEMA);
    invalid.cells.push({ id: "overlap", row: 0, column: 0, kind: "label" });
    assert.equal(technicalTableSchemaValidator.safeParse(invalid).success, false);
});

test("ETA usa o progresso observado e nunca fica negativo", () => {
    assert.equal(estimateRemainingTime({ progress: 25, elapsedSeconds: 50 }).seconds, 150);
    assert.equal(estimateRemainingTime({ progress: 100, elapsedSeconds: 50 }).seconds, 0);
    assert.equal(estimateRemainingTime({ progress: 0, elapsedSeconds: 10 }).seconds, null);
});

import assert from "node:assert/strict";
import test from "node:test";
import { budgetPdfFilename, inlinePdfContentDisposition } from "./pdf-filename";

test("uses the budget title as the PDF filename", () => {
    assert.equal(
        budgetPdfFilename("Adequação NR-12 — Unidade São Paulo"),
        "Adequação NR-12 — Unidade São Paulo.pdf",
    );
});

test("removes invalid filename characters and has a fallback", () => {
    assert.equal(budgetPdfFilename('  Projeto: linha 1/2?  '), "Projeto_ linha 1_2.pdf");
    assert.equal(budgetPdfFilename(" \n "), "Proposta comercial.pdf");
});

test("builds an ASCII-safe content disposition with an UTF-8 filename", () => {
    const header = inlinePdfContentDisposition("Adequação São Paulo.pdf");
    assert.match(header, /^inline; filename="Adequacao_Sao_Paulo\.pdf";/);
    assert.match(header, /filename\*=UTF-8''Adequa%C3%A7%C3%A3o%20S%C3%A3o%20Paulo\.pdf$/);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  createModelTemplateStructure,
  modelTemplateToLegacyContent,
  normalizeModelTemplateStructure,
} from "./model-template-structure";
import { renderCompositorPdfVariables } from "./budget-template-rendering";

test("creates visual header and footer structures with canvas elements", () => {
  const header = createModelTemplateStructure("cabecalho");
  const footer = createModelTemplateStructure("rodape");

  assert.equal(header.kind, "header_footer");
  assert.equal(footer.kind, "header_footer");
  if (header.kind !== "header_footer" || footer.kind !== "header_footer") return;

  assert.ok((header.props.all_header_layout?.elements.length ?? 0) > 0);
  assert.ok(footer.props.all_footer_layout?.elements.some((element) => element.type === "page_number"));
});

test("keeps legacy HTML models editable in the new visual structure", () => {
  const legacy = "<p>Proposta para {{cliente.razao_social}}</p>";
  const cover = normalizeModelTemplateStructure("capa", undefined, legacy);
  const header = normalizeModelTemplateStructure("cabecalho", undefined, legacy);

  assert.equal(cover.kind, "cover");
  assert.equal(header.kind, "header_footer");
  assert.match(modelTemplateToLegacyContent(cover), /cliente\.razao_social/);
  assert.match(modelTemplateToLegacyContent(header), /cliente\.razao_social/);
});

test("creates a complete budget model with compositor building blocks", () => {
  const structure = createModelTemplateStructure("orcamento_completo");
  assert.equal(structure.kind, "budget");
  if (structure.kind !== "budget") return;

  const types = new Set(structure.blocks.map((block) => block.type));
  assert.deepEqual(
    [...types].sort(),
    ["cover", "header_footer", "quote", "session", "text"].sort(),
  );
  const text = structure.blocks.find((block) => block.type === "text");
  const section = structure.blocks.find((block) => block.type === "session");
  assert.equal(text?.parent_id, section?.id);
});

test("preserves page-number placeholders while rendering customer variables", () => {
  const rendered = renderCompositorPdfVariables(
    {
      roots: [
        {
          id: "budget_block:test",
          budget_id: "budget:test",
          parent_id: null,
          type: "header_footer",
          label: "Rodapé",
          order_index: 0,
          props: {
            all_footer_layout: {
              version: 1,
              elements: [
                {
                  id: "page",
                  type: "page_number",
                  x_pct: 0,
                  y_pct: 0,
                  width_pct: 20,
                  height_pct: 20,
                  z_index: 1,
                  text: "{{page}} / {{total}} · {{cliente.razao_social}}",
                },
              ],
            },
          },
          created_at: "",
          updated_at: "",
          children: [],
          number: "",
          depth: 0,
        },
      ],
      items: {},
      imagesByBlock: {},
      scopeFigures: [],
    },
    { cliente: { razao_social: "Cliente Teste" }, orcamento: {} },
  );
  const layout = rendered?.roots[0]?.props.all_footer_layout as {
    elements: Array<{ text?: string }>;
  };
  assert.equal(layout.elements[0]?.text, "{{page}} / {{total}} · Cliente Teste");
});

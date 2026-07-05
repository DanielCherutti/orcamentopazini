import assert from "node:assert/strict";
import test from "node:test";
import {
  createModelTemplateStructure,
  modelTemplateToLegacyContent,
  normalizeModelTemplateStructure,
} from "./model-template-structure";
import { renderCompositorPdfVariables } from "./budget-template-rendering";
import {
  migrateHeaderFooterLayoutsForScopeMode,
  nudgeHeaderFooterElement,
  normalizeHeaderFooterLayout,
  resolveHeaderFooterSelection,
  snapHeaderFooterElement,
} from "./compositor/header-footer-layout";
import { parsePdfInlineRuns } from "./pdf/pdf-rich-text-runs";

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

test("preserves the selected header/footer layer when its layout is updated", () => {
  const layout = {
    version: 1 as const,
    elements: [
      {
        id: "background",
        type: "block" as const,
        x_pct: 0,
        y_pct: 0,
        width_pct: 100,
        height_pct: 100,
        z_index: 1,
      },
      {
        id: "logo",
        type: "image" as const,
        x_pct: 5,
        y_pct: 5,
        width_pct: 20,
        height_pct: 80,
        z_index: 2,
      },
    ],
  };

  assert.equal(resolveHeaderFooterSelection("logo", layout), "logo");
  assert.equal(resolveHeaderFooterSelection("removed", layout), "background");
  assert.equal(
    resolveHeaderFooterSelection("removed", { version: 1, elements: [] }),
    null,
  );
});

test("duplicates shared header/footer layouts when switching to separate pages", () => {
  const sharedHeader = createModelTemplateStructure("cabecalho");
  const sharedFooter = createModelTemplateStructure("rodape");
  assert.equal(sharedHeader.kind, "header_footer");
  assert.equal(sharedFooter.kind, "header_footer");
  if (sharedHeader.kind !== "header_footer" || sharedFooter.kind !== "header_footer") return;

  const migrated = migrateHeaderFooterLayoutsForScopeMode(
    {
      ...sharedHeader.props,
      all_footer_layout: sharedFooter.props.all_footer_layout,
    },
    "separate",
  );

  assert.deepEqual(migrated.cover_header_layout, migrated.all_header_layout);
  assert.deepEqual(migrated.inner_header_layout, migrated.all_header_layout);
  assert.deepEqual(migrated.cover_footer_layout, migrated.all_footer_layout);
  assert.deepEqual(migrated.inner_footer_layout, migrated.all_footer_layout);
  assert.notEqual(migrated.cover_header_layout, migrated.inner_header_layout);
  assert.notEqual(migrated.cover_footer_layout, migrated.inner_footer_layout);
});

test("uses the cover layouts as baseline when unifying separate pages", () => {
  const coverHeader = createModelTemplateStructure("cabecalho");
  const innerFooter = createModelTemplateStructure("rodape");
  assert.equal(coverHeader.kind, "header_footer");
  assert.equal(innerFooter.kind, "header_footer");
  if (coverHeader.kind !== "header_footer" || innerFooter.kind !== "header_footer") return;

  const migrated = migrateHeaderFooterLayoutsForScopeMode(
    {
      cover_header_layout: coverHeader.props.all_header_layout,
      inner_footer_layout: innerFooter.props.all_footer_layout,
    },
    "all",
  );

  assert.deepEqual(
    migrated.all_header_layout,
    normalizeHeaderFooterLayout(coverHeader.props.all_header_layout),
  );
  assert.deepEqual(
    migrated.all_footer_layout,
    normalizeHeaderFooterLayout(innerFooter.props.all_footer_layout),
  );
});

test("preserves inline rich-text formatting for the PDF renderer", () => {
  const runs = parsePdfInlineRuns(
    'Normal <strong>negrito <em>e itálico</em></strong> <u>sublinhado</u><br><span style="font-weight: 700; font-style: italic; font-size: 20px">combinado</span>',
  );

  assert.deepEqual(
    runs.map(({ text, bold, italic, underline, fontSizePt }) => ({
      text,
      bold,
      italic,
      underline,
      fontSizePt,
    })),
    [
      { text: "Normal ", bold: false, italic: false, underline: false, fontSizePt: undefined },
      { text: "negrito ", bold: true, italic: false, underline: false, fontSizePt: undefined },
      { text: "e itálico", bold: true, italic: true, underline: false, fontSizePt: undefined },
      { text: " ", bold: false, italic: false, underline: false, fontSizePt: undefined },
      { text: "sublinhado", bold: false, italic: false, underline: true, fontSizePt: undefined },
      { text: "\n", bold: false, italic: false, underline: false, fontSizePt: undefined },
      { text: "combinado", bold: true, italic: true, underline: false, fontSizePt: 15 },
    ],
  );
});

test("preserves an imported font reference for PDF rendering", () => {
  const [run] = parsePdfInlineRuns(
    '<span data-font-url="/api/uploads/library/tenant/fonts/custom.ttf" style="font-family: Pazini Custom; font-size: 16px">Fonte externa</span>',
  );

  assert.equal(run?.text, "Fonte externa");
  assert.equal(run?.fontFamily, "Pazini Custom");
  assert.equal(run?.fontUrl, "/api/uploads/library/tenant/fonts/custom.ttf");
  assert.equal(run?.fontSizePt, 12);
});

test("snaps header/footer objects to grid and alignment guides", () => {
  const base = {
    id: "moving",
    type: "text" as const,
    x_pct: 39.4,
    y_pct: 19.6,
    width_pct: 10,
    height_pct: 10,
    z_index: 2,
  };
  const aligned = snapHeaderFooterElement({
    element: base,
    otherElements: [
      {
        ...base,
        id: "reference",
        x_pct: 50,
        y_pct: 40,
        z_index: 1,
      },
    ],
    mode: "move",
    thresholdXPct: 1,
    thresholdYPct: 1,
    gridEnabled: true,
    gridSizePct: 5,
  });

  assert.equal(aligned.element.x_pct, 40);
  assert.equal(aligned.element.y_pct, 20);
  assert.deepEqual(aligned.guides, [
    { axis: "x", position_pct: 50 },
    { axis: "y", position_pct: 20 },
  ]);

  const resized = snapHeaderFooterElement({
    element: { ...base, x_pct: 10, y_pct: 10, width_pct: 39.3, height_pct: 19.4 },
    otherElements: [],
    mode: "resize",
    thresholdXPct: 1,
    thresholdYPct: 1,
    gridEnabled: true,
    gridSizePct: 5,
  });
  assert.equal(resized.element.width_pct, 40);
  assert.equal(resized.element.height_pct, 20);

  const objectAligned = snapHeaderFooterElement({
    element: { ...base, x_pct: 62.4 },
    otherElements: [{ ...base, id: "reference-73", x_pct: 73, y_pct: 80 }],
    mode: "move",
    thresholdXPct: 1,
    thresholdYPct: 0,
    gridEnabled: false,
  });
  assert.ok(Math.abs(objectAligned.element.x_pct - 63) < 0.000001);
  assert.deepEqual(objectAligned.guides, [{ axis: "x", position_pct: 73 }]);
});

test("moves header/footer objects by visual pixels with the keyboard", () => {
  const element = {
    id: "keyboard-object",
    type: "image" as const,
    x_pct: 10,
    y_pct: 20,
    width_pct: 20,
    height_pct: 30,
    z_index: 1,
  };
  const onePixel = nudgeHeaderFooterElement({
    element,
    direction: "ArrowRight",
    canvasWidth: 800,
    canvasHeight: 200,
  });
  assert.equal(onePixel.x_pct, 10.125);
  assert.equal(onePixel.y_pct, 20);

  const tenPixels = nudgeHeaderFooterElement({
    element: onePixel,
    direction: "ArrowDown",
    pixels: 10,
    canvasWidth: 800,
    canvasHeight: 200,
  });
  assert.equal(tenPixels.y_pct, 25);

  const clamped = nudgeHeaderFooterElement({
    element: { ...element, x_pct: 0, y_pct: 0 },
    direction: "ArrowLeft",
    pixels: 10,
    canvasWidth: 800,
    canvasHeight: 200,
  });
  assert.equal(clamped.x_pct, 0);
});

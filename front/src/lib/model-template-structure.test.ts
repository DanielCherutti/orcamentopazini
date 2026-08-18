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
import { buildTree, type BudgetBlockFlat } from "@/types/budget-compositor-types";
import { buildTocModel } from "@/components/budgets/compositor/compositor-toc-utils";

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
    ["cover", "header_footer", "figures", "toc", "scope", "quote", "session"].sort(),
  );
  const section = structure.blocks.find((block) => block.type === "session");
  assert.match(String(section?.props.description), /cliente\.razao_social/);

  const roots = structure.blocks
    .filter((block) => block.parent_id === null)
    .sort((a, b) => a.order_index - b.order_index);
  assert.ok(roots.findIndex((block) => block.type === "figures") < roots.findIndex((block) => block.type === "toc"));
  assert.ok(roots.findIndex((block) => block.type === "session") < roots.findIndex((block) => block.type === "scope"));
});

test("upgrades legacy budget models with automatic indexes and movable project detail", () => {
  const normalized = normalizeModelTemplateStructure("orcamento_completo", {
    version: 1,
    kind: "budget",
    blocks: [
      { id: "cover", parent_id: null, type: "cover", label: "CAPA", order_index: 0, props: {} },
      { id: "hf", parent_id: null, type: "header_footer", label: "CABEÇALHO", order_index: 1, props: {} },
      { id: "parent", parent_id: null, type: "session", label: "SEÇÃO", order_index: 2, props: {} },
      { id: "child", parent_id: "parent", type: "session", label: "SUBSEÇÃO", order_index: 0, props: {} },
      { id: "legacy-text", parent_id: "parent", type: "text", label: "FRETE", order_index: 1, props: { content: "<p>Incluso</p>" } },
      { id: "quote", parent_id: null, type: "quote", label: "ORÇAMENTO", order_index: 3, props: {} },
    ],
  });

  assert.equal(normalized.kind, "budget");
  if (normalized.kind !== "budget") return;
  const roots = normalized.blocks
    .filter((block) => block.parent_id === null)
    .sort((a, b) => a.order_index - b.order_index);
  assert.deepEqual(
    roots.map((block) => block.type),
    ["cover", "header_footer", "figures", "toc", "session", "scope", "quote"],
  );
  assert.equal(normalized.blocks.find((block) => block.id === "child")?.parent_id, "parent");
  const migratedText = normalized.blocks.find((block) => block.id === "legacy-text");
  assert.equal(migratedText?.type, "session");
  assert.equal(migratedText?.parent_id, "parent");
  assert.equal(migratedText?.props.description, "<p>Incluso</p>");

  const tree = buildTree(
    normalized.blocks.map((block) => ({
      ...block,
      budget_id: "budget:test",
      created_at: "",
      updated_at: "",
    })) as BudgetBlockFlat[],
  );
  const parent = tree.blocks.find((block) => block.id === "parent");
  assert.equal(parent?.number, "1");
  assert.deepEqual(parent?.children.map((block) => block.number), ["1.1", "1.2"]);
});

test("normalizes duplicated project detail blocks to a single root", () => {
  const normalized = normalizeModelTemplateStructure("orcamento_completo", {
    version: 1,
    kind: "budget",
    blocks: [
      { id: "scope-first", parent_id: null, type: "scope", label: "DETALHAMENTO", order_index: 2, props: {} },
      { id: "scope-duplicate", parent_id: null, type: "scope", label: "DETALHAMENTO DUPLICADO", order_index: 3, props: {} },
    ],
  });

  assert.equal(normalized.kind, "budget");
  if (normalized.kind !== "budget") return;
  const scopes = normalized.blocks.filter((block) => block.type === "scope");
  assert.equal(scopes.length, 1);
  assert.equal(scopes[0]?.id, "scope-first");
});

test("includes the first Presentation section in the table of contents", () => {
  const tree = buildTree([
    {
      id: "cover",
      budget_id: "budget:test",
      parent_id: null,
      type: "cover",
      label: "CAPA",
      order_index: 0,
      props: {},
      created_at: "",
      updated_at: "",
    },
    {
      id: "presentation",
      budget_id: "budget:test",
      parent_id: null,
      type: "session",
      label: "APRESENTAÇÃO",
      order_index: 1,
      props: { description: "<p>Conteúdo institucional</p>" },
      created_at: "",
      updated_at: "",
    },
  ]);

  assert.deepEqual(
    buildTocModel(tree.blocks, {}).map(({ number, title }) => ({ number, title })),
    [{ number: "1", title: "APRESENTAÇÃO" }],
  );
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

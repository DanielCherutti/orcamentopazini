import type {
  HeaderFooterBlockProps,
  HeaderFooterCanvasElement,
  HeaderFooterCanvasLayout,
  HeaderFooterPageNumberingConfig,
} from "@/types/budget-compositor-types";

export type HeaderFooterLayoutScope = "all" | "cover" | "inner";
export type HeaderFooterScopeMode = "all" | "separate";
export type HeaderFooterLayoutRegion = "header" | "footer";
export type HeaderFooterSnapGuide = {
  axis: "x" | "y";
  position_pct: number;
};
export type HeaderFooterLayoutField =
  | "all_header_layout"
  | "all_footer_layout"
  | "cover_header_layout"
  | "cover_footer_layout"
  | "inner_header_layout"
  | "inner_footer_layout";

export const EMPTY_HEADER_FOOTER_LAYOUT: HeaderFooterCanvasLayout = {
  version: 1,
  elements: [],
};

export const DEFAULT_PAGE_NUMBERING: Required<HeaderFooterPageNumberingConfig> = {
  enabled: true,
  placement: "footer",
  align: "right",
  start_at_page: 1,
  first_page_number: 1,
  hide_on_cover: false,
  inner_only: false,
  format: "current_total",
};

export function headerFooterLayoutField(
  scope: HeaderFooterLayoutScope,
  region: HeaderFooterLayoutRegion,
): HeaderFooterLayoutField {
  return `${scope}_${region}_layout` as HeaderFooterLayoutField;
}

export function normalizeHeaderFooterLayout(raw: unknown): HeaderFooterCanvasLayout {
  if (!raw || typeof raw !== "object") return EMPTY_HEADER_FOOTER_LAYOUT;
  const candidate = raw as Partial<HeaderFooterCanvasLayout>;
  const elements = Array.isArray(candidate.elements) ? candidate.elements : [];
  return {
    version: 1,
    elements: elements
      .filter((el): el is HeaderFooterCanvasElement => Boolean(el && typeof el === "object"))
      .map((el, index) => normalizeHeaderFooterElement(el, index)),
  };
}

export function normalizePageNumbering(raw: unknown): Required<HeaderFooterPageNumberingConfig> {
  const cfg = raw && typeof raw === "object" ? (raw as HeaderFooterPageNumberingConfig) : {};
  const placement = cfg.placement === "header" || cfg.placement === "footer"
    ? cfg.placement
    : DEFAULT_PAGE_NUMBERING.placement;
  const align = cfg.align === "left" || cfg.align === "center" || cfg.align === "right"
    ? cfg.align
    : DEFAULT_PAGE_NUMBERING.align;
  const format =
    cfg.format === "current" ||
    cfg.format === "current_total" ||
    cfg.format === "page_current" ||
    cfg.format === "page_current_total"
      ? cfg.format
      : DEFAULT_PAGE_NUMBERING.format;

  return {
    enabled: cfg.enabled !== false,
    placement,
    align,
    start_at_page: clampInt(cfg.start_at_page, 1, 999, DEFAULT_PAGE_NUMBERING.start_at_page),
    first_page_number: clampInt(cfg.first_page_number, 0, 999, DEFAULT_PAGE_NUMBERING.first_page_number),
    hide_on_cover: cfg.hide_on_cover === true,
    inner_only: cfg.inner_only === true,
    format,
  };
}

export function hasHeaderFooterLayoutContent(layout: HeaderFooterCanvasLayout | undefined): boolean {
  return Boolean(layout?.elements?.length);
}

export function resolveHeaderFooterSelection(
  selectedId: string | null,
  layout: HeaderFooterCanvasLayout,
): string | null {
  if (selectedId && layout.elements.some((element) => element.id === selectedId)) {
    return selectedId;
  }
  return layout.elements[0]?.id ?? null;
}

export function migrateHeaderFooterLayoutsForScopeMode(
  props: HeaderFooterBlockProps,
  mode: HeaderFooterScopeMode,
): Pick<
  HeaderFooterBlockProps,
  | "header_footer_scope_mode"
  | "all_header_layout"
  | "all_footer_layout"
  | "cover_header_layout"
  | "cover_footer_layout"
  | "inner_header_layout"
  | "inner_footer_layout"
> {
  if (mode === "separate") {
    const sharedHeader = normalizeHeaderFooterLayout(props.all_header_layout);
    const sharedFooter = normalizeHeaderFooterLayout(props.all_footer_layout);
    return {
      header_footer_scope_mode: "separate",
      all_header_layout: sharedHeader,
      all_footer_layout: sharedFooter,
      cover_header_layout: cloneHeaderFooterLayout(sharedHeader),
      cover_footer_layout: cloneHeaderFooterLayout(sharedFooter),
      inner_header_layout: cloneHeaderFooterLayout(sharedHeader),
      inner_footer_layout: cloneHeaderFooterLayout(sharedFooter),
    };
  }

  const currentSharedHeader = normalizeHeaderFooterLayout(props.all_header_layout);
  const currentSharedFooter = normalizeHeaderFooterLayout(props.all_footer_layout);
  const coverHeader = normalizeHeaderFooterLayout(props.cover_header_layout);
  const coverFooter = normalizeHeaderFooterLayout(props.cover_footer_layout);
  const innerHeader = normalizeHeaderFooterLayout(props.inner_header_layout);
  const innerFooter = normalizeHeaderFooterLayout(props.inner_footer_layout);
  const headerSource = hasHeaderFooterLayoutContent(coverHeader)
    ? coverHeader
    : hasHeaderFooterLayoutContent(innerHeader)
      ? innerHeader
      : currentSharedHeader;
  const footerSource = hasHeaderFooterLayoutContent(coverFooter)
    ? coverFooter
    : hasHeaderFooterLayoutContent(innerFooter)
      ? innerFooter
      : currentSharedFooter;

  return {
    header_footer_scope_mode: "all",
    all_header_layout: cloneHeaderFooterLayout(headerSource),
    all_footer_layout: cloneHeaderFooterLayout(footerSource),
    cover_header_layout: coverHeader,
    cover_footer_layout: coverFooter,
    inner_header_layout: innerHeader,
    inner_footer_layout: innerFooter,
  };
}

export function resolveHeaderFooterScopeMode(
  props: Pick<
    HeaderFooterBlockProps,
    | "header_footer_scope_mode"
    | "all_header_layout"
    | "all_footer_layout"
    | "cover_header_layout"
    | "cover_footer_layout"
    | "inner_header_layout"
    | "inner_footer_layout"
  > | undefined,
): HeaderFooterScopeMode {
  if (props?.header_footer_scope_mode === "all" || props?.header_footer_scope_mode === "separate") {
    return props.header_footer_scope_mode;
  }

  const hasSeparatedLayout =
    hasHeaderFooterLayoutContent(normalizeHeaderFooterLayout(props?.cover_header_layout)) ||
    hasHeaderFooterLayoutContent(normalizeHeaderFooterLayout(props?.cover_footer_layout)) ||
    hasHeaderFooterLayoutContent(normalizeHeaderFooterLayout(props?.inner_header_layout)) ||
    hasHeaderFooterLayoutContent(normalizeHeaderFooterLayout(props?.inner_footer_layout));

  if (hasSeparatedLayout) return "separate";
  return "all";
}

export function getLayoutsForPageScope(params: {
  mode?: HeaderFooterScopeMode;
  allLayout?: HeaderFooterCanvasLayout;
  scopeLayout?: HeaderFooterCanvasLayout;
}): HeaderFooterCanvasLayout[] {
  const layouts = params.mode === "all" ? [params.allLayout] : [params.scopeLayout];
  return layouts
    .map((layout) => normalizeHeaderFooterLayout(layout))
    .filter(hasHeaderFooterLayoutContent);
}

export function formatGeneratedPageNumber(params: {
  config: HeaderFooterPageNumberingConfig | undefined;
  pageNumber: number;
  totalPages: number;
}): string {
  const cfg = normalizePageNumbering(params.config);
  if (!cfg.enabled) return "";
  if (params.pageNumber < cfg.start_at_page) return "";

  const current = Math.max(0, params.pageNumber - cfg.start_at_page + cfg.first_page_number);
  const total = Math.max(current, params.totalPages - cfg.start_at_page + cfg.first_page_number);
  if (cfg.format === "current") return String(current);
  if (cfg.format === "page_current") return `Página ${current}`;
  if (cfg.format === "page_current_total") return `Página ${current} de ${total}`;
  return `${current} / ${total}`;
}

export function createHeaderFooterElement(
  type: HeaderFooterCanvasElement["type"],
  zIndex: number,
): HeaderFooterCanvasElement {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `hf-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const base = {
    id,
    type,
    x_pct: 8,
    y_pct: 18,
    width_pct: 34,
    height_pct: 42,
    z_index: zIndex,
    opacity: 1,
    font_size: 11,
    font_family: "Arial",
    font_weight: "normal" as const,
    font_style: "normal" as const,
    text_align: "left" as const,
    color: "#111827",
    background_color: "transparent",
    border_color: "transparent",
    padding: 4,
  };

  if (type === "image") {
    return {
      ...base,
      width_pct: 22,
      height_pct: 58,
      src: "",
    };
  }
  if (type === "columns") {
    return {
      ...base,
      x_pct: 4,
      y_pct: 14,
      width_pct: 92,
      height_pct: 52,
      columns: ["Esquerda", "Centro", "Direita"],
      text_align: "center",
    };
  }
  if (type === "block") {
    return {
      ...base,
      width_pct: 44,
      text: "Bloco personalizado",
      background_color: "#f8fafc",
      border_color: "#cbd5e1",
    };
  }
  if (type === "page_number") {
    return {
      ...base,
      x_pct: 78,
      y_pct: 28,
      width_pct: 18,
      height_pct: 28,
      text: "{{page}} / {{total}}",
      text_align: "right",
    };
  }
  return {
    ...base,
    text: "Texto",
  };
}

export function snapHeaderFooterElement(params: {
  element: HeaderFooterCanvasElement;
  otherElements: HeaderFooterCanvasElement[];
  mode: "move" | "resize";
  thresholdXPct: number;
  thresholdYPct: number;
  gridEnabled?: boolean;
  gridSizePct?: number;
  snapEnabled?: boolean;
}): { element: HeaderFooterCanvasElement; guides: HeaderFooterSnapGuide[] } {
  if (params.snapEnabled === false) return { element: params.element, guides: [] };
  const element = { ...params.element };
  const gridSize = clampNum(params.gridSizePct, 1, 50, 5);
  const xTargets = alignmentTargets(
    params.otherElements,
    "x",
    params.gridEnabled === true,
    gridSize,
  );
  const yTargets = alignmentTargets(
    params.otherElements,
    "y",
    params.gridEnabled === true,
    gridSize,
  );
  const guides: HeaderFooterSnapGuide[] = [];

  if (params.mode === "move") {
    const xAnchors = [element.x_pct, element.x_pct + element.width_pct / 2, element.x_pct + element.width_pct];
    const yAnchors = [element.y_pct, element.y_pct + element.height_pct / 2, element.y_pct + element.height_pct];
    const xMatch = closestAlignment(xAnchors, xTargets, params.thresholdXPct);
    const yMatch = closestAlignment(yAnchors, yTargets, params.thresholdYPct);
    if (xMatch) {
      element.x_pct += xMatch.delta;
      guides.push({ axis: "x", position_pct: xMatch.target });
    }
    if (yMatch) {
      element.y_pct += yMatch.delta;
      guides.push({ axis: "y", position_pct: yMatch.target });
    }
  } else {
    const right = element.x_pct + element.width_pct;
    const bottom = element.y_pct + element.height_pct;
    const xMatch = closestAlignment([right], xTargets, params.thresholdXPct);
    const yMatch = closestAlignment([bottom], yTargets, params.thresholdYPct);
    if (xMatch) {
      element.width_pct += xMatch.delta;
      guides.push({ axis: "x", position_pct: xMatch.target });
    }
    if (yMatch) {
      element.height_pct += yMatch.delta;
      guides.push({ axis: "y", position_pct: yMatch.target });
    }
  }

  return { element, guides };
}

export function nudgeHeaderFooterElement(params: {
  element: HeaderFooterCanvasElement;
  direction: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";
  pixels?: number;
  canvasWidth: number;
  canvasHeight: number;
}): HeaderFooterCanvasElement {
  const pixels = Math.max(1, Math.min(100, Math.trunc(params.pixels ?? 1)));
  const width = Math.max(1, params.canvasWidth);
  const height = Math.max(1, params.canvasHeight);
  const dx =
    params.direction === "ArrowLeft"
      ? -(pixels / width) * 100
      : params.direction === "ArrowRight"
        ? (pixels / width) * 100
        : 0;
  const dy =
    params.direction === "ArrowUp"
      ? -(pixels / height) * 100
      : params.direction === "ArrowDown"
        ? (pixels / height) * 100
        : 0;
  return {
    ...params.element,
    x_pct: clampNum(
      params.element.x_pct + dx,
      0,
      Math.max(0, 100 - params.element.width_pct),
      params.element.x_pct,
    ),
    y_pct: clampNum(
      params.element.y_pct + dy,
      0,
      Math.max(0, 100 - params.element.height_pct),
      params.element.y_pct,
    ),
  };
}

function alignmentTargets(
  elements: HeaderFooterCanvasElement[],
  axis: "x" | "y",
  gridEnabled: boolean,
  gridSize: number,
): number[] {
  const targets = new Set<number>([0, 50, 100]);
  for (const element of elements) {
    const start = axis === "x" ? element.x_pct : element.y_pct;
    const size = axis === "x" ? element.width_pct : element.height_pct;
    targets.add(start);
    targets.add(start + size / 2);
    targets.add(start + size);
  }
  if (gridEnabled) {
    for (let position = 0; position <= 100; position += gridSize) {
      targets.add(Math.min(100, position));
    }
  }
  return [...targets];
}

function closestAlignment(
  anchors: number[],
  targets: number[],
  threshold: number,
): { delta: number; target: number } | null {
  let best: { delta: number; target: number; distance: number } | null = null;
  for (const target of targets) {
    for (const anchor of anchors) {
      const delta = target - anchor;
      const distance = Math.abs(delta);
      if (distance > threshold || (best && distance >= best.distance)) continue;
      best = { delta, target, distance };
    }
  }
  return best ? { delta: best.delta, target: best.target } : null;
}

function normalizeHeaderFooterElement(
  raw: HeaderFooterCanvasElement,
  fallbackIndex: number,
): HeaderFooterCanvasElement {
  const type = ["text", "image", "columns", "block", "page_number"].includes(String(raw.type))
    ? raw.type
    : "text";
  return {
    ...raw,
    id: String(raw.id || `hf-${fallbackIndex}`),
    type,
    x_pct: clampNum(raw.x_pct, 0, 99, 8),
    y_pct: clampNum(raw.y_pct, 0, 99, 8),
    width_pct: clampNum(raw.width_pct, 1, 100, 30),
    height_pct: clampNum(raw.height_pct, 1, 100, 30),
    z_index: clampInt(raw.z_index, -999, 999, fallbackIndex),
    opacity: clampNum(raw.opacity, 0, 1, 1),
    rotate_deg: clampNum(raw.rotate_deg, -360, 360, 0),
    font_size: clampNum(raw.font_size, 6, 96, 11),
    padding: clampNum(raw.padding, 0, 40, 4),
    columns: Array.isArray(raw.columns) ? raw.columns.map((c) => String(c)) : raw.columns,
  };
}

function cloneHeaderFooterLayout(layout: HeaderFooterCanvasLayout): HeaderFooterCanvasLayout {
  return {
    version: 1,
    elements: layout.elements.map((element, index) =>
      normalizeHeaderFooterElement({ ...element }, index),
    ),
  };
}

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clampNum(value, min, max, fallback));
}

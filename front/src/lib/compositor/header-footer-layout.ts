import type {
  HeaderFooterCanvasElement,
  HeaderFooterCanvasLayout,
  HeaderFooterPageNumberingConfig,
} from "@/types/budget-compositor-types";

export type HeaderFooterLayoutScope = "all" | "cover" | "inner";
export type HeaderFooterLayoutRegion = "header" | "footer";
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

export function getLayoutsForPageScope(params: {
  allLayout?: HeaderFooterCanvasLayout;
  scopeLayout?: HeaderFooterCanvasLayout;
}): HeaderFooterCanvasLayout[] {
  return [params.allLayout, params.scopeLayout]
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

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clampNum(value, min, max, fallback));
}

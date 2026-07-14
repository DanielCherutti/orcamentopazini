export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;
export const EDITOR_A4_HEIGHT_PX = 1122;

export type DocumentMarginsCm = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export const DEFAULT_DOCUMENT_MARGINS_CM: DocumentMarginsCm = {
  top: 1.8,
  right: 2.2,
  bottom: 1.8,
  left: 2.2,
};

export const ABNT_DOCUMENT_MARGINS_CM: DocumentMarginsCm = {
  top: 3,
  right: 2,
  bottom: 2,
  left: 3,
};

export function cmToPt(cm: number): number {
  return (cm / 2.54) * 72;
}

export function ptToCm(pt: number): number {
  return (pt / 72) * 2.54;
}

export function cmToMm(cm: number): number {
  return cm * 10;
}

export function editorPxToPt(px: number): number {
  return px * (A4_HEIGHT_PT / EDITOR_A4_HEIGHT_PX);
}

export function clampMarginCm(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(Math.max(0, Math.min(8, parsed)) * 10) / 10;
}

export function normalizeDocumentMargins(
  raw: Partial<DocumentMarginsCm> | undefined,
  fallback: DocumentMarginsCm = DEFAULT_DOCUMENT_MARGINS_CM,
): DocumentMarginsCm {
  const margins = {
    top: clampMarginCm(raw?.top, fallback.top),
    right: clampMarginCm(raw?.right, fallback.right),
    bottom: clampMarginCm(raw?.bottom, fallback.bottom),
    left: clampMarginCm(raw?.left, fallback.left),
  };
  const maxHorizontal = A4_WIDTH_MM / 10 - 2;
  const maxVertical = A4_HEIGHT_MM / 10 - 2;
  if (margins.left + margins.right > maxHorizontal) {
    margins.right = Math.max(0, Math.round((maxHorizontal - margins.left) * 10) / 10);
  }
  if (margins.top + margins.bottom > maxVertical) {
    margins.bottom = Math.max(0, Math.round((maxVertical - margins.top) * 10) / 10);
  }
  return margins;
}

export function documentUsableAreaPt(params: {
  margins: DocumentMarginsCm;
  headerPt?: number;
  footerPt?: number;
}) {
  const top = cmToPt(params.margins.top) + Math.max(0, params.headerPt ?? 0);
  const bottom = cmToPt(params.margins.bottom) + Math.max(0, params.footerPt ?? 0);
  const left = cmToPt(params.margins.left);
  const right = cmToPt(params.margins.right);
  return {
    top,
    left,
    width: Math.max(1, A4_WIDTH_PT - left - right),
    height: Math.max(1, A4_HEIGHT_PT - top - bottom),
  };
}

export function centeredContainBox(params: {
  area: { top: number; left: number; width: number; height: number };
  widthPercent: number;
  aspect: number;
}) {
  const aspect = Number.isFinite(params.aspect) && params.aspect > 0 ? params.aspect : 1;
  const widthPercent = Math.max(8, Math.min(95, params.widthPercent));
  let width = params.area.width * (widthPercent / 100);
  let height = width / aspect;
  if (height > params.area.height) {
    height = params.area.height;
    width = height * aspect;
  }
  return {
    left: params.area.left + (params.area.width - width) / 2,
    top: params.area.top + (params.area.height - height) / 2,
    width,
    height,
  };
}

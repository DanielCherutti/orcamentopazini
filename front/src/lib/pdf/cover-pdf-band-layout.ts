/** Dimensões A4 (pt) e faixas da capa no PDF — partilhado entre React-PDF e pré-visualização no compositor. */
export const PDF_COVER_PAGE_W_PT = 595.28;
export const PDF_COVER_PAGE_H_PT = 841.89;

export const DEFAULT_COVER_HEADER_BAND_PT = 108;
export const DEFAULT_COVER_FOOTER_BAND_PT = 44;

export const COVER_HEADER_BAND_PT_MIN = 44;
export const COVER_HEADER_BAND_PT_MAX = 240;
export const COVER_FOOTER_BAND_PT_MIN = 28;
export const COVER_FOOTER_BAND_PT_MAX = 240;

export function clampCoverHeaderBandPt(value: unknown, fallback = DEFAULT_COVER_HEADER_BAND_PT): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(COVER_HEADER_BAND_PT_MIN, Math.min(COVER_HEADER_BAND_PT_MAX, Math.round(n)));
}

export function clampCoverFooterBandPt(value: unknown, fallback = DEFAULT_COVER_FOOTER_BAND_PT): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(COVER_FOOTER_BAND_PT_MIN, Math.min(COVER_FOOTER_BAND_PT_MAX, Math.round(n)));
}

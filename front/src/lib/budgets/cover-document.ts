import { DEFAULT_COVER_PROPS, type CoverBlockProps } from "@/types/budget-compositor-types";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** HTML inicial a partir de título/subtítulo legados (migração). */
export function defaultCoverHtmlFromLegacy(p: Partial<CoverBlockProps>): string {
  const main = escapeHtml((p.main_title || "PROPOSTA COMERCIAL").trim());
  const subRaw = (p.subtitle ?? "").trim();
  const subDefault = "Memorial Descritivo de Fornecimento (NR 33 E 35)";
  const sub = escapeHtml(subRaw || subDefault);
  return `<p style="text-align:center"><strong>${main}</strong></p><p style="text-align:center">${sub}</p><p><br></p>`;
}

/**
 * Mescla props da capa. Só aplica HTML inicial legado quando `cover_document_html` nunca foi
 * definido no registro — se o usuário esvaziar o editor, não recoloca o texto padrão.
 */
export function mergeCoverDocumentProps(raw: Record<string, unknown> | undefined): CoverBlockProps {
  const merged: CoverBlockProps = { ...DEFAULT_COVER_PROPS, ...(raw as CoverBlockProps) };
  const html = (merged.cover_document_html ?? "").trim();
  const coverHtmlWasExplicit =
    raw != null && typeof raw === "object" && "cover_document_html" in raw && raw.cover_document_html !== undefined;
  if (!html && !coverHtmlWasExplicit) {
    merged.cover_document_html = defaultCoverHtmlFromLegacy(merged);
  }
  return merged;
}

function clampInnerWatermarkOpacity(value: number | undefined, fallback: number): number {
  const n = typeof value === "number" ? value : fallback;
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 0.12) return 0.12;
  return n;
}

/**
 * Marca d’água das páginas internas (PDF, Sumário, Lista de figuras): usa a do documento se definida;
 * senão a da capa (mesma regra que `ProposalDocument`).
 */
export function resolveInnerPagesWatermark(coverProps: CoverBlockProps): {
  url: string | undefined;
  opacity: number;
} {
  const doc = coverProps.document_watermark_url?.trim();
  if (doc) {
    return {
      url: doc,
      opacity: clampInnerWatermarkOpacity(coverProps.document_watermark_opacity, 0.06),
    };
  }
  const cover = coverProps.cover_watermark_url?.trim();
  if (cover) {
    return {
      url: cover,
      opacity: clampInnerWatermarkOpacity(coverProps.cover_watermark_opacity, 0.12),
    };
  }
  return { url: undefined, opacity: 0.06 };
}

import React from "react";
import { Page, View, Image, Text, StyleSheet } from "@react-pdf/renderer";
import type { Budget } from "@/types/budget-types";
import type { ProposalSettings } from "@/actions/settings-actions";
import type { CoverBlockProps, HeaderFooterBlockProps } from "@/types/budget-compositor-types";
import { mergeCoverDocumentProps } from "@/lib/budgets/cover-document";
import { type PdfEmbeddedImages, proxyPdfImageSrc, proxyPdfImageUrlCore } from "@/lib/pdf/pdf-image-src";
import { sanitizeCoverHtmlForPdf } from "@/lib/pdf/sanitize-inline-styles-for-pdf";
import { splitCoverHtmlIntoPdfBlocks, splitCoverHtmlFragmentToSegments } from "@/lib/pdf/cover-pdf-blocks";
import { theme } from "../theme";
import { sanitizeTextForPdf } from "@/lib/pdf/sanitize-pdf-text";
import {
    buildCoverPdfBandContext,
    formatCoverBudgetCodeLabel,
    formatCoverPdfFooterLeftText,
    formatCoverPdfFooterRightText,
    resolveCoverPageShowFooterBand,
    resolveCoverPageShowHeaderBand,
    resolveCoverPdfHeaderCompanyText,
    resolveCoverPdfHeaderLogoUrl,
} from "@/lib/pdf/cover-pdf-band-resolve";
import { PdfProposalHeaderBand } from "@/components/pdf/pdf-proposal-header-band";
import { DEFAULT_CLIENT_LOGO_LAYOUT } from "@/lib/budgets/cover-client-logo-layout";
import {
  clampCoverFooterBandPt,
  clampCoverHeaderBandPt,
  DEFAULT_COVER_FOOTER_BAND_PT,
  DEFAULT_COVER_HEADER_BAND_PT,
} from "@/lib/pdf/cover-pdf-band-layout";
import { stripHtmlToText } from "@/lib/pdf/html-to-plain-text";
import {
  parsePdfInlineRuns,
  pdfInlineRunStyle,
} from "@/lib/pdf/pdf-rich-text-runs";
import {
  HeaderFooterPdfLayer,
  hasAnyHeaderFooterPdfLayout,
  renderTextWithPageNumbers,
} from "@/components/pdf/header-footer-layout-pdf";
import {
  getLayoutsForPageScope,
  resolveHeaderFooterScopeMode,
} from "@/lib/compositor/header-footer-layout";
import {
  DEFAULT_DOCUMENT_MARGINS_CM,
  centeredContainBox,
  cmToPt,
  documentUsableAreaPt,
  normalizeDocumentMargins,
} from "@/lib/document-page-layout";

/** Só URL HTTP(S) no HTML — nunca data URI (strings enormes quebram sanitize/split e o layout). */
function rewriteImgSrcInHtml(html: string, publicBase?: string): string {
  if (!html.trim()) return html;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const m = tag.match(/\bsrc=(["'])([^"']*)\1/i);
    if (!m) return tag;
    const q = m[1];
    const src = m[2];
    const proxied = proxyPdfImageUrlCore(src, publicBase) ?? src;
    return tag.replace(/\bsrc=(["'])([^"']*)\1/i, `src=${q}${proxied}${q}`);
  });
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const BODY_PAD_H = Math.round((22 / 210) * PAGE_W);
const BODY_PAD_V = Math.round((18 / 297) * PAGE_H);
const EDITOR_A4_HEIGHT_PX = 1122;
const EDITOR_PX_TO_PT = PAGE_H / EDITOR_A4_HEIGHT_PX;

const styles = StyleSheet.create({
  page: {
    fontFamily: theme.fonts.body,
    backgroundColor: "#FFFFFF",
    position: "relative",
    paddingHorizontal: BODY_PAD_H,
  },
  pagePadTopWithHeader: {
    paddingTop: BODY_PAD_V + DEFAULT_COVER_HEADER_BAND_PT,
  },
  pagePadTopNoHeader: {
    paddingTop: BODY_PAD_V,
  },
  pagePadBottomWithFooter: {
    paddingBottom: BODY_PAD_V + DEFAULT_COVER_FOOTER_BAND_PT,
  },
  pagePadBottomNoFooter: {
    paddingBottom: BODY_PAD_V,
  },
  watermarkLayer: {
    position: "absolute",
    left: 0,
    width: PAGE_W,
    zIndex: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  watermarkImg: {
    width: Math.round(PAGE_W * 0.82),
    height: Math.round(PAGE_H * 0.82),
    objectFit: "contain",
  },
  body: {
    position: "relative",
    zIndex: 1,
  },
  coverText: {
    fontSize: 11,
    fontFamily: theme.fonts.body,
    lineHeight: 1.45,
    color: "#171717",
    marginBottom: 6,
    textAlign: "left",
  },
  coverParagraphSpacer: {
    height: 12,
    marginBottom: 6,
  },
  coverHeading1: {
    fontSize: 20,
    fontFamily: theme.fonts.bold,
    lineHeight: 1.35,
    color: "#171717",
    marginBottom: 10,
  },
  coverHeading2: {
    fontSize: 16,
    fontFamily: theme.fonts.bold,
    lineHeight: 1.35,
    color: "#171717",
    marginBottom: 8,
  },
  coverHeading3: {
    fontSize: 13,
    fontFamily: theme.fonts.bold,
    lineHeight: 1.4,
    color: "#171717",
    marginBottom: 6,
  },
  coverImageFrame: {
    width: "100%",
    alignItems: "center",
    marginBottom: 8,
  },
  coverImageBase: {
    objectFit: "contain",
    objectPosition: "center",
  },
  coverHeaderBand: {
    position: "absolute",
    top: BODY_PAD_V,
    left: BODY_PAD_H,
    right: BODY_PAD_H,
    minHeight: DEFAULT_COVER_HEADER_BAND_PT - 10,
    paddingBottom: 8,
    zIndex: 2,
  },
  coverFooterBand: {
    position: "absolute",
    bottom: BODY_PAD_V,
    left: BODY_PAD_H,
    right: BODY_PAD_H,
    minHeight: DEFAULT_COVER_FOOTER_BAND_PT - 8,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 2,
  },
  coverFooterMuted: {
    fontSize: 8,
    color: theme.colors.textLight,
  },
  /** Código do orçamento na capa — só texto, sem linha de rodapé. */
  coverBudgetCodeStamp: {
    position: "absolute",
    bottom: BODY_PAD_V,
    left: BODY_PAD_H,
    zIndex: 4,
  },
  coverBudgetCodeText: {
    fontSize: 9,
    color: theme.colors.text,
    lineHeight: 1.3,
  },
});

function resolveClientLogoPdfBox(
  coverProps: CoverBlockProps,
  headerReservePt: number,
  footerReservePt: number,
  showCoverHeader: boolean,
  showCoverFooter: boolean,
): { left: number; top: number; width: number; height: number } | null {
  if (!coverProps.client_logo_url?.trim()) return null;
  const xPct = coverProps.client_logo_x_pct ?? DEFAULT_CLIENT_LOGO_LAYOUT.xPct;
  const yPct = coverProps.client_logo_y_pct ?? DEFAULT_CLIENT_LOGO_LAYOUT.yPct;
  const widthPct = coverProps.client_logo_width_pct ?? DEFAULT_CLIENT_LOGO_LAYOUT.widthPct;
  const aspect =
    coverProps.client_logo_aspect && coverProps.client_logo_aspect > 0
      ? coverProps.client_logo_aspect
      : 1;

  const padTop = showCoverHeader ? BODY_PAD_V + headerReservePt : BODY_PAD_V;
  const padBottom = showCoverFooter ? BODY_PAD_V + footerReservePt : BODY_PAD_V;
  const innerW = PAGE_W - 2 * BODY_PAD_H;
  const innerH = PAGE_H - padTop - padBottom;

  const w = (widthPct / 100) * innerW;
  const h = w / aspect;
  const left = BODY_PAD_H + (xPct / 100) * innerW;
  const top = padTop + (yPct / 100) * innerH;

  return { left, top, width: w, height: h };
}

function clampOpacity(value: number | undefined, fallback: number): number {
  const n = typeof value === "number" ? value : fallback;
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 0.32) return 0.32;
  return n;
}

function editorBandHeightToPt(value: unknown, fallbackPx: number): number {
  const n = typeof value === "number" ? value : Number(value);
  const px = Number.isFinite(n) ? n : fallbackPx;
  return Math.max(18, Math.min(180, px * EDITOR_PX_TO_PT));
}

function clampCoverImagePt(value: number | undefined, min: number, max: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const n = Number(value);
  if (n <= 0) return undefined;
  return Math.max(min, Math.min(max, n));
}

function resolveCoverBlockImageFrameStyle(align?: "left" | "center" | "right") {
  if (align === "left") return [styles.coverImageFrame, { alignItems: "flex-start" as const }];
  if (align === "right") return [styles.coverImageFrame, { alignItems: "flex-end" as const }];
  return styles.coverImageFrame;
}

function resolveCoverBlockImageStyle(block: {
  widthPt?: number;
  heightPt?: number;
  naturalWidth?: number;
  naturalHeight?: number;
}) {
  const maxWidth = PAGE_W - 2 * BODY_PAD_H;
  const maxHeight = PAGE_H * 0.56;
  const width = clampCoverImagePt(block.widthPt, 1, maxWidth);
  const height = clampCoverImagePt(block.heightPt, 1, maxHeight);
  const naturalAspect =
    Number.isFinite(block.naturalWidth) &&
    Number.isFinite(block.naturalHeight) &&
    Number(block.naturalWidth) > 0 &&
    Number(block.naturalHeight) > 0
      ? Number(block.naturalWidth) / Number(block.naturalHeight)
      : undefined;
  if (width && height && naturalAspect && Math.abs(width / height - naturalAspect) < 0.03) {
    return { width, height: width / naturalAspect };
  }
  if (width && height) return { width, height };
  if (width) return { width };
  if (height) return { height };
  return { width: maxWidth };
}

export function CompositorCoverPdfPage({
  budget,
  settings,
  coverProps: raw,
  headerFooterProps,
  pdfEmbeddedImages,
}: {
  budget: Budget;
  settings: ProposalSettings;
  coverProps: CoverBlockProps;
  headerFooterProps?: HeaderFooterBlockProps;
  pdfEmbeddedImages?: PdfEmbeddedImages;
}) {
  const coverProps = mergeCoverDocumentProps(raw as unknown as Record<string, unknown>);
  const coverWatermarkSource = (headerFooterProps?.cover_watermark_url ?? coverProps.cover_watermark_url)?.trim();
  const coverWatermarkOpacity =
    headerFooterProps?.cover_watermark_opacity ?? coverProps.cover_watermark_opacity;
  const coverWatermarkScalePct = Math.max(
    40,
    Math.min(220, Number(headerFooterProps?.cover_watermark_scale_pct ?? 100) || 100),
  );
  const wmResolved = proxyPdfImageSrc(
    coverWatermarkSource,
    settings.app_public_url,
    pdfEmbeddedImages,
  );
  const wmOpacity = clampOpacity(coverWatermarkOpacity, 0.12);
  const html = sanitizeCoverHtmlForPdf(
    rewriteImgSrcInHtml(coverProps.cover_document_html ?? "", settings.app_public_url),
  );
  const blocks = splitCoverHtmlIntoPdfBlocks(html);
  const bandCtx = buildCoverPdfBandContext(budget);
  const companyName = sanitizeTextForPdf(
    resolveCoverPdfHeaderCompanyText(coverProps, settings.company_name),
  );
  const logoUrlRaw = resolveCoverPdfHeaderLogoUrl(coverProps, settings.company_logo_url);
  const logoSrc = logoUrlRaw
    ? proxyPdfImageSrc(logoUrlRaw, settings.app_public_url, pdfEmbeddedImages)
    : undefined;
  const clientLogoUrlRaw = coverProps.client_logo_url?.trim();
  const clientLogoSrc = clientLogoUrlRaw
    ? proxyPdfImageSrc(clientLogoUrlRaw, settings.app_public_url, pdfEmbeddedImages)
    : undefined;
  const headerFooterScopeMode = resolveHeaderFooterScopeMode(headerFooterProps);
  const customCoverHeaderText = headerFooterScopeMode === "separate"
    ? sanitizeTextForPdf(stripHtmlToText(String(headerFooterProps?.cover_header_html ?? ""))).trim()
    : "";
  const customCoverFooterText = headerFooterScopeMode === "separate"
    ? sanitizeTextForPdf(stripHtmlToText(String(headerFooterProps?.cover_footer_html ?? ""))).trim()
    : "";
  const coverHeaderLayouts = getLayoutsForPageScope({
    mode: headerFooterScopeMode,
    allLayout: headerFooterProps?.all_header_layout,
    scopeLayout: headerFooterProps?.cover_header_layout,
  });
  const coverFooterLayouts = getLayoutsForPageScope({
    mode: headerFooterScopeMode,
    allLayout: headerFooterProps?.all_footer_layout,
    scopeLayout: headerFooterProps?.cover_footer_layout,
  });
  const hasCoverHeaderLayout = hasAnyHeaderFooterPdfLayout(coverHeaderLayouts);
  const hasCoverFooterLayout = hasAnyHeaderFooterPdfLayout(coverFooterLayouts);
  const showCoverHeader = resolveCoverPageShowHeaderBand(
    coverProps,
    settings,
    headerFooterProps,
    Boolean(customCoverHeaderText || hasCoverHeaderLayout),
  );
  const showCoverFooter = resolveCoverPageShowFooterBand(
    coverProps,
    headerFooterProps,
    Boolean(customCoverFooterText || hasCoverFooterLayout),
  );
  const headerReserveFromCover = coverProps.cover_pdf_header_band_height_pt;
  const footerReserveFromCover = coverProps.cover_pdf_footer_band_height_pt;
  const headerReserve = customCoverHeaderText || hasCoverHeaderLayout
    ? editorBandHeightToPt(headerFooterProps?.cover_header_height, DEFAULT_COVER_HEADER_BAND_PT)
    : clampCoverHeaderBandPt(
        headerReserveFromCover ?? headerFooterProps?.cover_header_height,
        DEFAULT_COVER_HEADER_BAND_PT,
      );
  const footerReserve = customCoverFooterText || hasCoverFooterLayout
    ? editorBandHeightToPt(headerFooterProps?.cover_footer_height, DEFAULT_COVER_FOOTER_BAND_PT)
    : clampCoverFooterBandPt(
        footerReserveFromCover ?? headerFooterProps?.cover_footer_height,
        DEFAULT_COVER_FOOTER_BAND_PT,
      );
  const footerLeft = sanitizeTextForPdf(formatCoverPdfFooterLeftText(coverProps, bandCtx));
  const footerRight = sanitizeTextForPdf(formatCoverPdfFooterRightText(coverProps, bandCtx));
  const hasCoverFooterBandContent = Boolean(
    customCoverFooterText || hasCoverFooterLayout || footerLeft.trim() || footerRight.trim(),
  );
  const showCoverFooterBand = showCoverFooter && hasCoverFooterBandContent;
  const coverBudgetCodeLabel = sanitizeTextForPdf(formatCoverBudgetCodeLabel(bandCtx));
  const pagePaddingTop = showCoverHeader
    ? (hasCoverHeaderLayout ? headerReserve : BODY_PAD_V + headerReserve)
    : BODY_PAD_V;
  const pagePaddingBottom = showCoverFooterBand
    ? (hasCoverFooterLayout ? footerReserve : BODY_PAD_V + footerReserve)
    : BODY_PAD_V;

  const hasConfiguredMargins = [
    headerFooterProps?.page_margin_top_cm,
    headerFooterProps?.page_margin_right_cm,
    headerFooterProps?.page_margin_bottom_cm,
    headerFooterProps?.page_margin_left_cm,
  ].some((value) => value !== undefined);
  const margins = normalizeDocumentMargins(
    hasConfiguredMargins
      ? {
          top: headerFooterProps?.page_margin_top_cm,
          right: headerFooterProps?.page_margin_right_cm,
          bottom: headerFooterProps?.page_margin_bottom_cm,
          left: headerFooterProps?.page_margin_left_cm,
        }
      : undefined,
    DEFAULT_DOCUMENT_MARGINS_CM,
  );
  const effectivePaddingTop = hasConfiguredMargins
    ? cmToPt(margins.top) + (showCoverHeader ? headerReserve : 0)
    : pagePaddingTop;
  const effectivePaddingBottom = hasConfiguredMargins
    ? cmToPt(margins.bottom) + (showCoverFooterBand ? footerReserve : 0)
    : pagePaddingBottom;
  const effectivePaddingLeft = hasConfiguredMargins ? cmToPt(margins.left) : BODY_PAD_H;
  const effectivePaddingRight = hasConfiguredMargins ? cmToPt(margins.right) : BODY_PAD_H;
  const coverUsableArea = documentUsableAreaPt({
    margins,
    headerPt: showCoverHeader ? headerReserve : 0,
    footerPt: showCoverFooterBand ? footerReserve : 0,
  });
  const coverWatermarkBox = centeredContainBox({
    area: coverUsableArea,
    widthPercent:
      Number(headerFooterProps?.cover_watermark_width_pct ?? 78) *
      (coverWatermarkScalePct / 100),
    aspect: Number(headerFooterProps?.cover_watermark_aspect ?? 1),
  });

  /** Marca d’água não pode ocupar a página inteira: cobria cabeçalho/rodapé no PDF (ordem de pintura). */
  const clientLogoBox = resolveClientLogoPdfBox(
    coverProps,
    headerReserve,
    footerReserve,
    showCoverHeader,
    showCoverFooterBand,
  );

  return (
    <Page
      size="A4"
      style={[
        styles.page,
        {
          paddingTop: effectivePaddingTop,
          paddingBottom: effectivePaddingBottom,
          paddingLeft: effectivePaddingLeft,
          paddingRight: effectivePaddingRight,
        },
      ]}
    >
      {/* Marca d’água primeiro; cabeçalho/rodapé com zIndex maior para não ficarem ocultos. */}
      {wmResolved ? (
        <View style={[styles.watermarkLayer, { top: 0, height: PAGE_H }]}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
          <Image
            src={wmResolved}
            style={[
              styles.watermarkImg,
              {
                opacity: wmOpacity,
                position: "absolute",
                left: coverWatermarkBox.left,
                top: coverWatermarkBox.top,
                width: coverWatermarkBox.width,
                height: coverWatermarkBox.height,
              },
            ]}
          />
        </View>
      ) : null}
      {showCoverHeader ? (
        <View
          style={[
            styles.coverHeaderBand,
            {
              ...(hasCoverHeaderLayout ? { top: 0, left: 0, right: 0 } : {}),
              minHeight: Math.max(30, headerReserve - 10),
              height: headerReserve,
              paddingBottom: hasCoverHeaderLayout ? 0 : 8,
            },
          ]}
          fixed
        >
          {hasCoverHeaderLayout ? (
            <HeaderFooterPdfLayer
              layouts={coverHeaderLayouts}
              pageScope="cover"
              region="header"
              width={hasCoverHeaderLayout ? PAGE_W : PAGE_W - 2 * BODY_PAD_H}
              height={headerReserve}
              appPublicUrl={settings.app_public_url}
              pdfEmbeddedImages={pdfEmbeddedImages}
              pageNumbering={headerFooterProps?.page_numbering}
            />
          ) : customCoverHeaderText ? (
            renderTextWithPageNumbers(
              customCoverHeaderText,
              { fontSize: 9, color: theme.colors.text, lineHeight: 1.3 },
              headerFooterProps?.page_numbering,
              "cover"
            )
          ) : (
            <PdfProposalHeaderBand settings={settings} logoSrc={logoSrc} companyName={companyName} />
          )}
        </View>
      ) : null}
      {showCoverFooterBand ? (
        <View
          style={[
            styles.coverFooterBand,
            {
              ...(hasCoverFooterLayout ? { bottom: 0, left: 0, right: 0 } : {}),
              minHeight: Math.max(26, footerReserve - 8),
              height: footerReserve,
              paddingTop: hasCoverFooterLayout ? 0 : 6,
            },
          ]}
          fixed
        >
          {hasCoverFooterLayout ? (
            <HeaderFooterPdfLayer
              layouts={coverFooterLayouts}
              pageScope="cover"
              region="footer"
              width={hasCoverFooterLayout ? PAGE_W : PAGE_W - 2 * BODY_PAD_H}
              height={footerReserve}
              appPublicUrl={settings.app_public_url}
              pdfEmbeddedImages={pdfEmbeddedImages}
              pageNumbering={headerFooterProps?.page_numbering}
            />
          ) : customCoverFooterText ? (
            renderTextWithPageNumbers(
              customCoverFooterText,
              styles.coverFooterMuted,
              headerFooterProps?.page_numbering,
              "cover"
            )
          ) : (
            <>
              <Text style={styles.coverFooterMuted}>{footerLeft}</Text>
              <Text style={styles.coverFooterMuted}>{footerRight}</Text>
            </>
          )}
        </View>
      ) : null}
      {coverBudgetCodeLabel ? (
        <View style={styles.coverBudgetCodeStamp} fixed>
          <Text style={styles.coverBudgetCodeText}>{coverBudgetCodeLabel}</Text>
        </View>
      ) : null}
      {clientLogoSrc && clientLogoBox ? (
        <View
          style={{
            position: "absolute",
            left: clientLogoBox.left,
            top: clientLogoBox.top,
            width: clientLogoBox.width,
            height: clientLogoBox.height,
            zIndex: 3,
          }}
        >
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
          <Image
            src={clientLogoSrc}
            style={{
              width: clientLogoBox.width,
              height: clientLogoBox.height,
              objectFit: "contain",
            }}
          />
        </View>
      ) : null}
      <View style={styles.body} wrap>
        {blocks.map((b, i) => {
          if (b.type === "pageBreak") {
            return (
              <Text
                key={`cover-pb-${i}`}
                break
                style={{ fontSize: 0.1, lineHeight: 0.1, color: "#ffffff", opacity: 0 }}
              >
                {" "}
              </Text>
            );
          }
          if (b.type === "img") {
            const src = proxyPdfImageSrc(b.src, settings.app_public_url, pdfEmbeddedImages) ?? b.src;
            return (
              <View key={`cover-img-${i}`} style={resolveCoverBlockImageFrameStyle(b.align)}>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
                <Image src={src} style={[styles.coverImageBase, resolveCoverBlockImageStyle(b)]} />
              </View>
            );
          }
          const segs = splitCoverHtmlFragmentToSegments(b.content, { preserveEmptyParagraphs: true });
          if (!segs.length) return null;
          return (
            <React.Fragment key={`cover-txt-${i}`}>
              {segs.map((seg, j) => {
                const paragraphStyle = {
                  ...(seg.textAlign ? { textAlign: seg.textAlign } : {}),
                  ...(seg.lineHeight ? { lineHeight: seg.lineHeight } : {}),
                  ...(seg.marginTopPt ? { marginTop: seg.marginTopPt } : {}),
                ...(seg.marginBottomPt ? { marginBottom: seg.marginBottomPt } : {}),
                ...(seg.marginLeftPt || seg.listMarker
                  ? { marginLeft: (seg.marginLeftPt ?? 0) + (seg.listMarker ? (seg.listDepth ?? 1) * 12 : 0) }
                  : {}),
                ...(seg.marginRightPt ? { marginRight: seg.marginRightPt } : {}),
                ...(seg.textIndentPt || seg.listMarker
                  ? { textIndent: (seg.textIndentPt ?? 0) - (seg.listMarker ? 10 : 0) }
                  : {}),
              };
                if (seg.kind === "heading") {
                  const hs =
                    seg.level === 1
                      ? styles.coverHeading1
                      : seg.level === 2
                        ? styles.coverHeading2
                        : styles.coverHeading3;
                  const runs = seg.rawHtml ? parsePdfInlineRuns(seg.rawHtml) : [];
                  return (
                    <Text
                      key={`${i}-${j}`}
                      style={[hs, paragraphStyle]}
                    >
                      {runs.length
                        ? runs.map((r, k) => (
                            <Text key={`${i}-${j}-${k}`} style={pdfInlineRunStyle(r)}>
                              {r.text}
                            </Text>
                          ))
                        : seg.text}
                    </Text>
                  );
                }
                if (seg.isEmpty) {
                  return <View key={`${i}-${j}`} style={styles.coverParagraphSpacer} wrap={false} />;
                }
                const runs = seg.rawHtml ? parsePdfInlineRuns(seg.rawHtml) : [];
                return (
                  <Text
                    key={`${i}-${j}`}
                    style={[styles.coverText, paragraphStyle]}
                  >
                    {seg.listMarker ? `${seg.listMarker} ` : null}
                    {runs.length
                      ? runs.map((r, k) => (
                          <Text key={`${i}-${j}-${k}`} style={pdfInlineRunStyle(r)}>
                            {r.text}
                          </Text>
                        ))
                      : seg.text}
                  </Text>
                );
              })}
            </React.Fragment>
          );
        })}
      </View>
    </Page>
  );
}

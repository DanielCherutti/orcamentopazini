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
  coverImageBase: {
    marginBottom: 8,
    objectFit: "contain",
  },
  coverHeaderBand: {
    position: "absolute",
    top: BODY_PAD_V,
    left: BODY_PAD_H,
    right: BODY_PAD_H,
    minHeight: DEFAULT_COVER_HEADER_BAND_PT - 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    zIndex: 2,
  },
  coverFooterBand: {
    position: "absolute",
    bottom: BODY_PAD_V,
    left: BODY_PAD_H,
    right: BODY_PAD_H,
    minHeight: DEFAULT_COVER_FOOTER_BAND_PT - 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 2,
  },
  coverFooterMuted: {
    fontSize: 8,
    color: theme.colors.textLight,
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

function resolveWatermarkPdfBox(
  xPct: number,
  yPct: number,
  widthPct: number,
  aspect: number,
): { left: number; top: number; width: number; height: number } {
  const safeAspect = aspect > 0 ? aspect : 1;
  const wPct = Math.max(8, Math.min(95, widthPct));
  const x = Math.max(0, Math.min(100 - wPct, xPct));
  const w = (wPct / 100) * PAGE_W;
  const h = w / safeAspect;
  const maxYPct = Math.max(0, 100 - (h / PAGE_H) * 100);
  const y = Math.max(0, Math.min(maxYPct, yPct));
  return {
    left: (x / 100) * PAGE_W,
    top: (y / 100) * PAGE_H,
    width: w,
    height: h,
  };
}

function clampOpacity(value: number | undefined, fallback: number): number {
  const n = typeof value === "number" ? value : fallback;
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 0.32) return 0.32;
  return n;
}

function clampCoverImagePt(value: number | undefined, min: number, max: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const n = Number(value);
  if (n <= 0) return undefined;
  return Math.max(min, Math.min(max, n));
}

function resolveCoverBlockImageStyle(block: { widthPt?: number; heightPt?: number }) {
  const maxWidth = PAGE_W - 2 * BODY_PAD_H;
  const maxHeight = PAGE_H * 0.56;
  const width = clampCoverImagePt(block.widthPt, 36, maxWidth);
  const height = clampCoverImagePt(block.heightPt, 24, maxHeight);
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
  const coverWatermarkBox = resolveWatermarkPdfBox(
    Number(headerFooterProps?.cover_watermark_x_pct ?? 11),
    Number(headerFooterProps?.cover_watermark_y_pct ?? 11),
    Number(headerFooterProps?.cover_watermark_width_pct ?? 78),
    Number(headerFooterProps?.cover_watermark_aspect ?? 1),
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
  const fill = settings.pdf_header_fill_from_settings === true;
  const companyName = sanitizeTextForPdf(
    resolveCoverPdfHeaderCompanyText(coverProps, fill ? settings.company_name : undefined),
  );
  const logoUrlRaw = resolveCoverPdfHeaderLogoUrl(coverProps, fill ? settings.company_logo_url : undefined);
  const logoSrc = logoUrlRaw
    ? proxyPdfImageSrc(logoUrlRaw, settings.app_public_url, pdfEmbeddedImages)
    : undefined;
  const clientLogoUrlRaw = coverProps.client_logo_url?.trim();
  const clientLogoSrc = clientLogoUrlRaw
    ? proxyPdfImageSrc(clientLogoUrlRaw, settings.app_public_url, pdfEmbeddedImages)
    : undefined;
  const customCoverHeaderText = sanitizeTextForPdf(
    stripHtmlToText(String(headerFooterProps?.cover_header_html ?? ""))
  ).trim();
  const customCoverFooterText = sanitizeTextForPdf(
    stripHtmlToText(String(headerFooterProps?.cover_footer_html ?? ""))
  ).trim();
  const showCoverHeader = resolveCoverPageShowHeaderBand(
    coverProps,
    settings,
    headerFooterProps,
    Boolean(customCoverHeaderText),
  );
  const showCoverFooter = resolveCoverPageShowFooterBand(
    coverProps,
    headerFooterProps,
    Boolean(customCoverFooterText),
  );
  const headerReserveFromCover = coverProps.cover_pdf_header_band_height_pt;
  const footerReserveFromCover = coverProps.cover_pdf_footer_band_height_pt;
  const headerReserve = customCoverHeaderText
    ? clampCoverHeaderBandPt(headerFooterProps?.cover_header_height, DEFAULT_COVER_HEADER_BAND_PT)
    : clampCoverHeaderBandPt(
        headerReserveFromCover ?? headerFooterProps?.cover_header_height,
        DEFAULT_COVER_HEADER_BAND_PT,
      );
  const footerReserve = customCoverFooterText
    ? clampCoverFooterBandPt(headerFooterProps?.cover_footer_height, DEFAULT_COVER_FOOTER_BAND_PT)
    : clampCoverFooterBandPt(
        footerReserveFromCover ?? headerFooterProps?.cover_footer_height,
        DEFAULT_COVER_FOOTER_BAND_PT,
      );
  const footerLeft = sanitizeTextForPdf(formatCoverPdfFooterLeftText(coverProps, bandCtx));
  const footerRight = sanitizeTextForPdf(formatCoverPdfFooterRightText(coverProps, bandCtx));

  /** Marca d’água não pode ocupar a página inteira: cobria cabeçalho/rodapé no PDF (ordem de pintura). */
  const clientLogoBox = resolveClientLogoPdfBox(
    coverProps,
    headerReserve,
    footerReserve,
    showCoverHeader,
    showCoverFooter,
  );

  return (
    <Page
      size="A4"
      style={[
        styles.page,
        showCoverHeader ? { paddingTop: BODY_PAD_V + headerReserve } : styles.pagePadTopNoHeader,
        showCoverFooter ? { paddingBottom: BODY_PAD_V + footerReserve } : styles.pagePadBottomNoFooter,
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
                transform: `scale(${coverWatermarkScalePct / 100})`,
              },
            ]}
          />
        </View>
      ) : null}
      {showCoverHeader ? (
        <View style={[styles.coverHeaderBand, { minHeight: Math.max(30, headerReserve - 10) }]} fixed>
          {customCoverHeaderText ? (
            <Text style={{ fontSize: 9, color: theme.colors.text, lineHeight: 1.3 }}>
              {customCoverHeaderText}
            </Text>
          ) : (
            <PdfProposalHeaderBand settings={settings} logoSrc={logoSrc} companyName={companyName} />
          )}
        </View>
      ) : null}
      {showCoverFooter ? (
        <View style={[styles.coverFooterBand, { minHeight: Math.max(26, footerReserve - 8) }]} fixed>
          {customCoverFooterText ? (
            <Text style={styles.coverFooterMuted}>{customCoverFooterText}</Text>
          ) : (
            <>
              <Text style={styles.coverFooterMuted}>{footerLeft}</Text>
              <Text style={styles.coverFooterMuted}>{footerRight}</Text>
            </>
          )}
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
          if (b.type === "img") {
            const src = proxyPdfImageSrc(b.src, settings.app_public_url, pdfEmbeddedImages) ?? b.src;
            return (
              /* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */
              <Image key={`cover-img-${i}`} src={src} style={[styles.coverImageBase, resolveCoverBlockImageStyle(b)]} />
            );
          }
          const segs = splitCoverHtmlFragmentToSegments(b.content);
          if (!segs.length) return null;
          return (
            <React.Fragment key={`cover-txt-${i}`}>
              {segs.map((seg, j) => {
                if (seg.kind === "heading") {
                  const hs =
                    seg.level === 1
                      ? styles.coverHeading1
                      : seg.level === 2
                        ? styles.coverHeading2
                        : styles.coverHeading3;
                  return (
                    <Text
                      key={`${i}-${j}`}
                      style={seg.textAlign ? [hs, { textAlign: seg.textAlign }] : hs}
                    >
                      {seg.text}
                    </Text>
                  );
                }
                const align = seg.textAlign;
                return (
                  <Text
                    key={`${i}-${j}`}
                    style={align ? [styles.coverText, { textAlign: align }] : styles.coverText}
                  >
                    {seg.text}
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

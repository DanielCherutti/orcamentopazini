import React from "react";
import { Page, View, Image, Text, StyleSheet } from "@react-pdf/renderer";
import type { Budget } from "@/types/budget-types";
import type { ProposalSettings } from "@/actions/settings-actions";
import type { CoverBlockProps } from "@/types/budget-compositor-types";
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
    resolveCoverPdfHeaderCompanyText,
    resolveCoverPdfHeaderLogoUrl,
    shouldShowCoverPdfHeaderBand,
    resolveCoverPdfShowFooterBand,
} from "@/lib/pdf/cover-pdf-band-resolve";
import { PdfProposalHeaderBand } from "@/components/pdf/pdf-proposal-header-band";

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
/** Espaço reservado para cabeçalho (duas colunas: marca + contatos). */
const COVER_HEADER_RESERVE = 88;
const COVER_FOOTER_RESERVE = 34;

const styles = StyleSheet.create({
  page: {
    fontFamily: theme.fonts.body,
    backgroundColor: "#FFFFFF",
    position: "relative",
    paddingHorizontal: BODY_PAD_H,
  },
  pagePadTopWithHeader: {
    paddingTop: BODY_PAD_V + COVER_HEADER_RESERVE,
  },
  pagePadTopNoHeader: {
    paddingTop: BODY_PAD_V,
  },
  pagePadBottomWithFooter: {
    paddingBottom: BODY_PAD_V + COVER_FOOTER_RESERVE,
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
  coverImage: {
    width: PAGE_W - 2 * BODY_PAD_H,
    height: 280,
    marginBottom: 8,
    objectFit: "contain",
  },
  coverHeaderBand: {
    position: "absolute",
    top: BODY_PAD_V,
    left: BODY_PAD_H,
    right: BODY_PAD_H,
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
  /** Logomarca do cliente (canto da área de texto; independente do cabeçalho da empresa). */
  clientLogoCorner: {
    position: "absolute",
    top: 4,
    right: 0,
    width: 120,
    height: 48,
    zIndex: 3,
  },
  clientLogoImg: {
    width: 120,
    height: 48,
    objectFit: "contain",
  },
});

function clampOpacity(value: number | undefined, fallback: number): number {
  const n = typeof value === "number" ? value : fallback;
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 0.32) return 0.32;
  return n;
}

export function CompositorCoverPdfPage({
  budget,
  settings,
  coverProps: raw,
  pdfEmbeddedImages,
}: {
  budget: Budget;
  settings: ProposalSettings;
  coverProps: CoverBlockProps;
  pdfEmbeddedImages?: PdfEmbeddedImages;
}) {
  const coverProps = mergeCoverDocumentProps(raw as unknown as Record<string, unknown>);
  const wmResolved = proxyPdfImageSrc(
    coverProps.cover_watermark_url,
    settings.app_public_url,
    pdfEmbeddedImages,
  );
  const wmOpacity = clampOpacity(coverProps.cover_watermark_opacity, 0.12);
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
  const showCoverHeader = shouldShowCoverPdfHeaderBand(coverProps, settings);
  const showCoverFooter = resolveCoverPdfShowFooterBand(coverProps);
  const footerLeft = sanitizeTextForPdf(formatCoverPdfFooterLeftText(coverProps, bandCtx));
  const footerRight = sanitizeTextForPdf(formatCoverPdfFooterRightText(coverProps, bandCtx));

  /** Marca d’água não pode ocupar a página inteira: cobria cabeçalho/rodapé no PDF (ordem de pintura). */
  const wmTopInset = showCoverHeader ? BODY_PAD_V + COVER_HEADER_RESERVE : 0;
  const wmBottomInset = showCoverFooter ? BODY_PAD_V + COVER_FOOTER_RESERVE : 0;
  const wmHeight = Math.max(40, PAGE_H - wmTopInset - wmBottomInset);

  return (
    <Page
      size="A4"
      style={[
        styles.page,
        showCoverHeader ? styles.pagePadTopWithHeader : styles.pagePadTopNoHeader,
        showCoverFooter ? styles.pagePadBottomWithFooter : styles.pagePadBottomNoFooter,
      ]}
    >
      {/* Marca d’água primeiro; cabeçalho/rodapé com zIndex maior para não ficarem ocultos. */}
      {wmResolved ? (
        <View
          style={[styles.watermarkLayer, { top: wmTopInset, height: wmHeight }]}
        >
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
          <Image src={wmResolved} style={[styles.watermarkImg, { opacity: wmOpacity }]} />
        </View>
      ) : null}
      {showCoverHeader ? (
        <View style={styles.coverHeaderBand} fixed>
          <PdfProposalHeaderBand settings={settings} logoSrc={logoSrc} companyName={companyName} />
        </View>
      ) : null}
      {showCoverFooter ? (
        <View style={styles.coverFooterBand} fixed>
          <Text style={styles.coverFooterMuted}>{footerLeft}</Text>
          <Text style={styles.coverFooterMuted}>{footerRight}</Text>
        </View>
      ) : null}
      <View style={styles.body} wrap>
        {clientLogoSrc ? (
          <View style={styles.clientLogoCorner}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
            <Image src={clientLogoSrc} style={styles.clientLogoImg} />
          </View>
        ) : null}
        {blocks.map((b, i) => {
          if (b.type === "img") {
            const src = proxyPdfImageSrc(b.src, settings.app_public_url, pdfEmbeddedImages) ?? b.src;
            return (
              /* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */
              <Image key={`cover-img-${i}`} src={src} style={styles.coverImage} />
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
                    <Text key={`${i}-${j}`} style={hs}>
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

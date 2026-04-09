import React from "react";
import { Page, View, Image, Text, StyleSheet } from "@react-pdf/renderer";
import type { Budget } from "@/types/budget-types";
import type { ProposalSettings } from "@/actions/settings-actions";
import type { CoverBlockProps } from "@/types/budget-compositor-types";
import { mergeCoverDocumentProps } from "@/lib/budgets/cover-document";
import { type PdfEmbeddedImages, proxyPdfImageSrc } from "@/lib/pdf/pdf-image-src";
import { sanitizeCoverHtmlForPdf } from "@/lib/pdf/sanitize-inline-styles-for-pdf";
import { splitCoverHtmlIntoPdfBlocks, splitCoverHtmlFragmentToSegments } from "@/lib/pdf/cover-pdf-blocks";
import { theme } from "../theme";

function rewriteImgSrcInHtml(
  html: string,
  publicBase?: string,
  embedded?: PdfEmbeddedImages,
): string {
  if (!html.trim()) return html;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const m = tag.match(/\bsrc=(["'])([^"']*)\1/i);
    if (!m) return tag;
    const q = m[1];
    const src = m[2];
    const proxied = proxyPdfImageSrc(src, publicBase, embedded) ?? src;
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
    paddingTop: BODY_PAD_V,
    paddingBottom: BODY_PAD_V,
    paddingHorizontal: BODY_PAD_H,
  },
  watermarkLayer: {
    position: "absolute",
    left: 0,
    top: 0,
    width: PAGE_W,
    height: PAGE_H,
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
});

function clampOpacity(value: number | undefined, fallback: number): number {
  const n = typeof value === "number" ? value : fallback;
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 0.32) return 0.32;
  return n;
}

export function CompositorCoverPdfPage({
  budget: _budget,
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
    rewriteImgSrcInHtml(coverProps.cover_document_html ?? "", settings.app_public_url, pdfEmbeddedImages),
  );
  const blocks = splitCoverHtmlIntoPdfBlocks(html);

  return (
    <Page size="A4" style={styles.page}>
      {wmResolved ? (
        <View style={styles.watermarkLayer}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
          <Image src={wmResolved} style={[styles.watermarkImg, { opacity: wmOpacity }]} />
        </View>
      ) : null}
      <View style={styles.body} wrap>
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

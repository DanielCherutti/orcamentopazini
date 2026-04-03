import React from "react";
import { Page, View, Image, StyleSheet } from "@react-pdf/renderer";
import Html from "react-pdf-html";
import type { Budget } from "@/types/budget-types";
import type { ProposalSettings } from "@/actions/settings-actions";
import type { CoverBlockProps } from "@/types/budget-compositor-types";
import { mergeCoverDocumentProps } from "@/lib/budgets/cover-document";
import { theme } from "../theme";

function resolvePdfImageSrc(url: string | undefined, publicBase?: string): string | undefined {
  const u = url?.trim();
  if (!u) return undefined;
  if (/^data:/i.test(u)) return u;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("//")) return `https:${u}`;
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : publicBase?.replace(/\/$/, "");
  if (u.startsWith("/")) {
    if (origin) return `${origin}${u}`;
    return u;
  }
  if (origin) return `${origin}/${u.replace(/^\.?\//, "")}`;
  return `/${u.replace(/^\.?\//, "")}`;
}

function proxyPdfImageSrc(url: string | undefined, publicBase?: string): string | undefined {
  const resolved = resolvePdfImageSrc(url, publicBase);
  if (!resolved || /^data:/i.test(resolved)) return resolved;
  if (resolved.includes("/api/pdf/image?src=")) return resolved;
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : publicBase?.replace(/\/$/, "");
  if (!origin) return resolved;
  return `${origin}/api/pdf/image?src=${encodeURIComponent(resolved)}`;
}

function rewriteImgSrcInHtml(html: string, publicBase?: string): string {
  if (!html.trim()) return html;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const m = tag.match(/\bsrc=(["'])([^"']*)\1/i);
    if (!m) return tag;
    const q = m[1];
    const src = m[2];
    const proxied = proxyPdfImageSrc(src, publicBase) ?? src;
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
    width: PAGE_W,
    height: PAGE_H,
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
    position: "absolute",
    left: 0,
    top: 0,
    width: PAGE_W,
    height: PAGE_H,
    zIndex: 1,
    paddingTop: BODY_PAD_V,
    paddingBottom: BODY_PAD_V,
    paddingHorizontal: BODY_PAD_H,
  },
});

function clampOpacity(value: number | undefined, fallback: number): number {
  const n = typeof value === "number" ? value : fallback;
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 0.32) return 0.32;
  return n;
}

const coverHtmlStylesheet = {
  p: {
    fontSize: 11,
    fontFamily: theme.fonts.body,
    lineHeight: 1.45,
    marginTop: 0,
    marginBottom: 4,
    color: "#171717",
  },
  strong: { fontFamily: theme.fonts.bold },
  b: { fontFamily: theme.fonts.bold },
  em: { fontFamily: theme.fonts.oblique },
  i: { fontFamily: theme.fonts.oblique },
  h1: { fontSize: 18, fontFamily: theme.fonts.bold, marginBottom: 8, marginTop: 0, color: "#171717" },
  h2: { fontSize: 14, fontFamily: theme.fonts.bold, marginBottom: 6, marginTop: 0, color: "#171717" },
  h3: { fontSize: 12, fontFamily: theme.fonts.bold, marginBottom: 4, marginTop: 0, color: "#171717" },
  img: { maxWidth: "100%", objectFit: "contain" as const },
  ul: { marginBottom: 6, marginTop: 0 },
  ol: { marginBottom: 6, marginTop: 0 },
  li: { fontSize: 11, fontFamily: theme.fonts.body, lineHeight: 1.45 },
  a: { color: "#1e3a8a" },
};

export function CompositorCoverPdfPage({
  budget: _budget,
  settings,
  coverProps: raw,
}: {
  budget: Budget;
  settings: ProposalSettings;
  coverProps: CoverBlockProps;
}) {
  const coverProps = mergeCoverDocumentProps(raw as unknown as Record<string, unknown>);
  const wmResolved = proxyPdfImageSrc(coverProps.cover_watermark_url, settings.app_public_url);
  const wmOpacity = clampOpacity(coverProps.cover_watermark_opacity, 0.12);
  const html = rewriteImgSrcInHtml(coverProps.cover_document_html ?? "", settings.app_public_url);

  return (
    <Page size="A4" style={styles.page}>
      {wmResolved ? (
        <View style={styles.watermarkLayer}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
          <Image src={wmResolved} style={[styles.watermarkImg, { opacity: wmOpacity }]} />
        </View>
      ) : null}
      <View style={styles.body}>
        <Html stylesheet={coverHtmlStylesheet}>{html}</Html>
      </View>
    </Page>
  );
}

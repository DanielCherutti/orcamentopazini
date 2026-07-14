import React from "react";
import { Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { ProposalSettings } from "@/actions/settings-actions";
import { theme } from "@/components/pdf/theme";
import { PdfProposalHeaderBand } from "@/components/pdf/pdf-proposal-header-band";
import {
    HeaderFooterPdfLayer,
    PaginationProbeText,
    hasAnyHeaderFooterPdfLayout,
    renderTextWithPageNumbers,
} from "@/components/pdf/header-footer-layout-pdf";
import {
    getLayoutsForPageScope,
    resolveHeaderFooterScopeMode,
} from "@/lib/compositor/header-footer-layout";
import { pdfInnerRunningHeaderShouldShow } from "@/lib/pdf/pdf-proposal-header";
import { proxyPdfImageSrc, type PdfEmbeddedImages } from "@/lib/pdf/pdf-image-src";
import { sanitizeTextForPdf } from "@/lib/pdf/sanitize-pdf-text";
import type { PdfInnerPageCommonProps } from "@/lib/pdf/pdf-compositor-document-shell";
import {
    centeredContainBox,
    cmToPt,
    documentUsableAreaPt,
    normalizeDocumentMargins,
    ptToCm,
} from "@/lib/document-page-layout";

export type PdfPaginationCollector = {
    segmentStartPages: Record<string, number>;
};

export const PDF_PAGE_W = 595.28;
export const PDF_PAGE_H = 841.89;
export const INNER_PAD = 35;
const INNER_HEADER_RESERVE = 108;
const INNER_FOOTER_RESERVE = 44;
const EDITOR_A4_HEIGHT_PX = 1122;
const EDITOR_PX_TO_PT = PDF_PAGE_H / EDITOR_A4_HEIGHT_PX;

function editorBandHeightToPt(value: unknown, fallbackPx: number): number {
    const n = typeof value === "number" ? value : Number(value);
    const px = Number.isFinite(n) ? n : fallbackPx;
    return Math.max(18, Math.min(180, px * EDITOR_PX_TO_PT));
}

const styles = StyleSheet.create({
    pageWithWatermark: {
        position: "relative",
    },
    documentWatermarkLayer: {
        position: "absolute",
        left: 0,
        width: PDF_PAGE_W,
        justifyContent: "center",
        alignItems: "center",
    },
    documentWatermarkImage: {
        width: Math.round(PDF_PAGE_W * 0.82),
        height: Math.round(PDF_PAGE_H * 0.82),
        objectFit: "contain",
    },
    innerPageRoot: {
        position: "relative",
        fontFamily: theme.fonts.body,
        fontSize: 11,
        color: theme.colors.text,
    },
    innerPageForeground: {
        position: "relative",
    },
    innerPageContentWrap: {
        position: "relative",
    },
    segmentHeader: {
        marginBottom: 14,
        borderBottomWidth: 2,
        borderBottomColor: theme.colors.secondary,
        paddingBottom: 5,
    },
    runningHeaderBand: {
        position: "absolute",
        top: INNER_PAD,
        left: INNER_PAD,
        right: INNER_PAD,
        minHeight: 98,
        paddingBottom: 8,
    },
    runningFooterBand: {
        position: "absolute",
        bottom: INNER_PAD,
        left: INNER_PAD,
        right: INNER_PAD,
        minHeight: 36,
        paddingTop: 6,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    runningFooterMuted: {
        fontSize: 8,
        color: theme.colors.textLight,
    },
    headerTitle: {
        color: theme.colors.primary,
        fontFamily: theme.fonts.bold,
        fontSize: 14,
        textTransform: "uppercase",
    },
});

export type PdfInnerPageProps = PdfInnerPageCommonProps & {
    pageKey: string;
    title: string;
    children: React.ReactNode;
    pageStyleExtra?: { flexDirection?: "row" | "column" };
    paginationProbeKey?: string;
    paginationCollector?: PdfPaginationCollector;
    wrap?: boolean;
};

/** Páginas internas com cabeçalho/rodapé/marca d’água iguais ao PDF de orçamento. */
export function PdfInnerPage({
    pageKey,
    title,
    children,
    settings,
    budget: _budget,
    pdfEmbeddedImages,
    docWatermarkSrc,
    docWatermarkOpacity,
    omitDocumentWatermark,
    pageStyleExtra,
    paginationProbeKey,
    paginationCollector,
    innerHeaderText,
    innerFooterText,
    showInnerHeaderBand = true,
    showInnerFooterBand = true,
    innerHeaderHeight,
    innerFooterHeight,
    innerWatermarkScalePct,
    innerWatermarkWidthPct,
    innerWatermarkAspect,
    headerFooterProps,
    wrap,
}: PdfInnerPageProps) {
    void _budget;
    const pageTitle = sanitizeTextForPdf(title).trim();
    const company = sanitizeTextForPdf(settings.company_name?.trim() || "");
    const logoUrl = settings.company_logo_url?.trim();
    const logoSrc = logoUrl
        ? proxyPdfImageSrc(logoUrl, settings.app_public_url, pdfEmbeddedImages)
        : undefined;
    const showRunningHeader = showInnerHeaderBand && pdfInnerRunningHeaderShouldShow(settings);
    const headerFooterScopeMode = resolveHeaderFooterScopeMode(headerFooterProps);
    const customHeader =
        showInnerHeaderBand && headerFooterScopeMode === "separate"
            ? (innerHeaderText ?? "").trim()
            : "";
    const customFooter =
        showInnerFooterBand && headerFooterScopeMode === "separate"
            ? (innerFooterText ?? "").trim()
            : "";
    const innerHeaderLayouts = getLayoutsForPageScope({
        mode: headerFooterScopeMode,
        allLayout: headerFooterProps?.all_header_layout,
        scopeLayout: headerFooterProps?.inner_header_layout,
    });
    const innerFooterLayouts = getLayoutsForPageScope({
        mode: headerFooterScopeMode,
        allLayout: headerFooterProps?.all_footer_layout,
        scopeLayout: headerFooterProps?.inner_footer_layout,
    });
    const hasInnerHeaderLayout = hasAnyHeaderFooterPdfLayout(innerHeaderLayouts);
    const hasInnerFooterLayout = hasAnyHeaderFooterPdfLayout(innerFooterLayouts);
    const hasInnerFooterContent = Boolean(customFooter || hasInnerFooterLayout);
    const customHeaderReserve = editorBandHeightToPt(innerHeaderHeight, INNER_HEADER_RESERVE);
    const customFooterReserve = editorBandHeightToPt(innerFooterHeight, INNER_FOOTER_RESERVE);
    const headerReserve =
        showInnerHeaderBand && (customHeader || hasInnerHeaderLayout)
            ? customHeaderReserve
            : showRunningHeader
              ? INNER_HEADER_RESERVE
              : 0;
    const footerReserve =
        showInnerFooterBand && hasInnerFooterContent ? customFooterReserve : 0;

    const hasConfiguredMargins = [
        headerFooterProps?.page_margin_top_cm,
        headerFooterProps?.page_margin_right_cm,
        headerFooterProps?.page_margin_bottom_cm,
        headerFooterProps?.page_margin_left_cm,
    ].some((value) => value !== undefined);
    const legacyMarginCm = ptToCm(INNER_PAD);
    const margins = normalizeDocumentMargins(
        hasConfiguredMargins
            ? {
                  top: headerFooterProps?.page_margin_top_cm,
                  right: headerFooterProps?.page_margin_right_cm,
                  bottom: headerFooterProps?.page_margin_bottom_cm,
                  left: headerFooterProps?.page_margin_left_cm,
              }
            : undefined,
        { top: legacyMarginCm, right: legacyMarginCm, bottom: legacyMarginCm, left: legacyMarginCm },
    );
    const usableArea = documentUsableAreaPt({
        margins,
        headerPt: headerReserve,
        footerPt: footerReserve,
    });
    const wmTop = usableArea.top;
    const wmHeight = usableArea.height;
    const wmOpacity = Math.min(0.22, Math.max(docWatermarkOpacity, 0.08));
    const wmScale = Math.max(
        40,
        Math.min(220, Number.isFinite(innerWatermarkScalePct) ? Number(innerWatermarkScalePct) : 100),
    );
    const wmBox = centeredContainBox({
        area: usableArea,
        widthPercent: Number(innerWatermarkWidthPct ?? 78) * (wmScale / 100),
        aspect: Number(innerWatermarkAspect ?? 1),
    });
    const pagePadTop = cmToPt(margins.top) + headerReserve;
    const pagePadBottom = cmToPt(margins.bottom) + footerReserve;
    const pagePadLeft = cmToPt(margins.left);
    const pagePadRight = cmToPt(margins.right);

    return (
        <Page
            key={pageKey}
            size="A4"
            wrap={wrap}
            style={[
                styles.innerPageRoot,
                styles.pageWithWatermark,
                {
                    paddingTop: pagePadTop,
                    paddingBottom: pagePadBottom,
                    paddingLeft: pagePadLeft,
                    paddingRight: pagePadRight,
                },
            ]}
        >
            {!omitDocumentWatermark && docWatermarkSrc ? (
                <View
                    fixed
                    style={[
                        styles.documentWatermarkLayer,
                        {
                            top: wmTop,
                            height: wmHeight,
                        },
                    ]}
                >
                    <Image
                        src={docWatermarkSrc}
                        style={[
                            styles.documentWatermarkImage,
                            {
                                opacity: wmOpacity,
                                position: "absolute",
                                left: wmBox.left,
                                top: wmBox.top,
                                width: wmBox.width,
                                height: wmBox.height,
                            },
                        ]}
                    />
                </View>
            ) : null}
            <View style={[styles.innerPageContentWrap, ...(pageStyleExtra ? [pageStyleExtra] : [])]}>
                <View style={styles.innerPageForeground}>
                    {pageTitle ? (
                        <View style={styles.segmentHeader}>
                            <Text style={styles.headerTitle}>{pageTitle}</Text>
                        </View>
                    ) : null}
                    {children}
                </View>
            </View>
            {showInnerHeaderBand && (customHeader || showRunningHeader || hasInnerHeaderLayout) ? (
                <View
                    style={[
                        styles.runningHeaderBand,
                        {
                            ...(hasInnerHeaderLayout ? { top: 0, left: 0, right: 0 } : {}),
                            minHeight:
                                hasInnerHeaderLayout || customHeader
                                    ? customHeaderReserve
                                    : INNER_HEADER_RESERVE,
                            height: headerReserve || INNER_HEADER_RESERVE,
                            paddingBottom: hasInnerHeaderLayout ? 0 : 8,
                        },
                    ]}
                    fixed
                >
                    {hasInnerHeaderLayout ? (
                        <HeaderFooterPdfLayer
                            layouts={innerHeaderLayouts}
                            pageScope="inner"
                            region="header"
                            width={hasInnerHeaderLayout ? PDF_PAGE_W : PDF_PAGE_W - 2 * INNER_PAD}
                            height={headerReserve || INNER_HEADER_RESERVE}
                            appPublicUrl={settings.app_public_url}
                            pdfEmbeddedImages={pdfEmbeddedImages}
                            pageNumbering={headerFooterProps?.page_numbering}
                        />
                    ) : customHeader ? (
                        renderTextWithPageNumbers(
                            customHeader,
                            { fontSize: 9, color: theme.colors.text, lineHeight: 1.3 },
                            headerFooterProps?.page_numbering,
                            "inner",
                        )
                    ) : showRunningHeader ? (
                        <PdfProposalHeaderBand
                            settings={settings}
                            logoSrc={logoSrc}
                            companyName={company}
                        />
                    ) : null}
                </View>
            ) : null}
            {showInnerFooterBand && hasInnerFooterContent ? (
                <View
                    style={[
                        styles.runningFooterBand,
                        {
                            ...(hasInnerFooterLayout ? { bottom: 0, left: 0, right: 0 } : {}),
                            minHeight: customFooterReserve,
                            height: footerReserve,
                            paddingTop: hasInnerFooterLayout ? 0 : 6,
                        },
                    ]}
                    fixed
                >
                    {hasInnerFooterLayout ? (
                        <HeaderFooterPdfLayer
                            layouts={innerFooterLayouts}
                            pageScope="inner"
                            region="footer"
                            width={hasInnerFooterLayout ? PDF_PAGE_W : PDF_PAGE_W - 2 * INNER_PAD}
                            height={footerReserve}
                            appPublicUrl={settings.app_public_url}
                            pdfEmbeddedImages={pdfEmbeddedImages}
                            pageNumbering={headerFooterProps?.page_numbering}
                        />
                    ) : (
                        renderTextWithPageNumbers(
                            customFooter,
                            styles.runningFooterMuted,
                            headerFooterProps?.page_numbering,
                            "inner",
                        )
                    )}
                </View>
            ) : null}
            <PaginationProbeText
                paginationCollector={paginationCollector}
                paginationProbeKey={paginationProbeKey}
            />
        </Page>
    );
}

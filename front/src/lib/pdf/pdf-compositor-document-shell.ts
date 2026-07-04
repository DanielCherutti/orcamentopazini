import type { ProposalSettings } from "@/actions/settings-actions";
import type { CompositorPdfPayload } from "@/components/pdf/compositor-pdf-types";
import { mergeCoverDocumentProps, resolveInnerPagesWatermark } from "@/lib/budgets/cover-document";
import { stripHtmlToText } from "@/lib/pdf/html-to-plain-text";
import { proxyPdfImageSrc, type PdfEmbeddedImages } from "@/lib/pdf/pdf-image-src";
import { sanitizeTextForPdf } from "@/lib/pdf/sanitize-pdf-text";
import {
    DEFAULT_HEADER_FOOTER_PROPS,
    flattenTree,
    type CoverBlockProps,
    type HeaderFooterBlockProps,
} from "@/types/budget-compositor-types";
import type { Budget } from "@/types/budget-types";

export function mergeHeaderFooterProps(
    raw: Record<string, unknown> | undefined,
): HeaderFooterBlockProps {
    return {
        ...DEFAULT_HEADER_FOOTER_PROPS,
        ...(raw ?? {}),
    };
}

export function htmlBandToPlainText(html: string | undefined): string {
    return sanitizeTextForPdf(stripHtmlToText(String(html ?? ""))).trim();
}

export type PdfCompositorShell = {
    compositorCoverMerged: CoverBlockProps;
    headerFooterProps: HeaderFooterBlockProps;
    docWatermarkSrc: string | undefined;
    effectiveInnerWatermarkOpacity: number;
    innerHeaderText: string;
    innerFooterText: string;
    innerWatermarkScalePct: number | undefined;
    innerWatermarkXPct: number | undefined;
    innerWatermarkYPct: number | undefined;
    innerWatermarkWidthPct: number | undefined;
    innerWatermarkAspect: number | undefined;
};

export function resolveCompositorBlocks(compositorPdf?: CompositorPdfPayload): {
    compositorCoverMerged: CoverBlockProps;
    headerFooterProps: HeaderFooterBlockProps;
} {
    const coverBlock = compositorPdf
        ? flattenTree(compositorPdf.roots).find((b) => b.type === "cover")
        : undefined;
    const headerFooterBlock = compositorPdf
        ? flattenTree(compositorPdf.roots).find((b) => b.type === "header_footer")
        : undefined;
    return {
        compositorCoverMerged: mergeCoverDocumentProps(
            coverBlock?.props as Record<string, unknown> | undefined,
        ),
        headerFooterProps: mergeHeaderFooterProps(
            headerFooterBlock?.props as Record<string, unknown> | undefined,
        ),
    };
}

/** Mesma resolução de marca/cabeçalho/rodapé usada em `ProposalDocument`. */
export function resolvePdfCompositorShell(
    compositorPdf: CompositorPdfPayload | undefined,
    settings: ProposalSettings,
    pdfEmbeddedImages?: PdfEmbeddedImages,
): PdfCompositorShell {
    const { compositorCoverMerged, headerFooterProps } = resolveCompositorBlocks(compositorPdf);

    const useCoverWatermarkOnInner = headerFooterProps.inner_use_cover_watermark !== false;
    const innerWatermarkSource = (
        useCoverWatermarkOnInner
            ? headerFooterProps.cover_watermark_url
            : headerFooterProps.inner_watermark_url
    )?.trim();
    const innerWatermarkOpacity = useCoverWatermarkOnInner
        ? headerFooterProps.cover_watermark_opacity
        : headerFooterProps.inner_watermark_opacity;
    const innerWatermarkScalePct = useCoverWatermarkOnInner
        ? headerFooterProps.cover_watermark_scale_pct
        : headerFooterProps.inner_watermark_scale_pct;
    const innerWatermarkXPct = useCoverWatermarkOnInner
        ? headerFooterProps.cover_watermark_x_pct
        : headerFooterProps.inner_watermark_x_pct;
    const innerWatermarkYPct = useCoverWatermarkOnInner
        ? headerFooterProps.cover_watermark_y_pct
        : headerFooterProps.inner_watermark_y_pct;
    const innerWatermarkWidthPct = useCoverWatermarkOnInner
        ? headerFooterProps.cover_watermark_width_pct
        : headerFooterProps.inner_watermark_width_pct;
    const innerWatermarkAspect = useCoverWatermarkOnInner
        ? headerFooterProps.cover_watermark_aspect
        : headerFooterProps.inner_watermark_aspect;

    const { url: legacyDocWatermarkSource, opacity: legacyDocWatermarkOpacity } =
        resolveInnerPagesWatermark(compositorCoverMerged);

    let docWatermarkSrc = proxyPdfImageSrc(
        innerWatermarkSource || legacyDocWatermarkSource,
        settings.app_public_url,
        pdfEmbeddedImages,
    );
    let effectiveInnerWatermarkOpacity =
        typeof innerWatermarkOpacity === "number" && Number.isFinite(innerWatermarkOpacity)
            ? innerWatermarkOpacity
            : legacyDocWatermarkOpacity;

    if (!docWatermarkSrc) {
        const coverOnly = compositorCoverMerged.cover_watermark_url?.trim();
        if (coverOnly) {
            const fromCover = proxyPdfImageSrc(
                coverOnly,
                settings.app_public_url,
                pdfEmbeddedImages,
            );
            if (fromCover) {
                docWatermarkSrc = fromCover;
                const o = compositorCoverMerged.cover_watermark_opacity;
                effectiveInnerWatermarkOpacity =
                    typeof o === "number" && Number.isFinite(o) ? o : 0.12;
            }
        }
    }

    return {
        compositorCoverMerged,
        headerFooterProps,
        docWatermarkSrc,
        effectiveInnerWatermarkOpacity,
        innerHeaderText: htmlBandToPlainText(headerFooterProps.inner_header_html),
        innerFooterText: htmlBandToPlainText(headerFooterProps.inner_footer_html),
        innerWatermarkScalePct,
        innerWatermarkXPct,
        innerWatermarkYPct,
        innerWatermarkWidthPct,
        innerWatermarkAspect,
    };
}

export type PdfInnerPageCommonProps = {
    settings: ProposalSettings;
    budget: Budget;
    pdfEmbeddedImages?: PdfEmbeddedImages;
    docWatermarkSrc: string | undefined;
    docWatermarkOpacity: number;
    omitDocumentWatermark: boolean;
    innerHeaderText: string;
    innerFooterText: string;
    showInnerHeaderBand: boolean;
    showInnerFooterBand: boolean;
    innerHeaderHeight?: number;
    innerFooterHeight?: number;
    innerWatermarkScalePct?: number;
    innerWatermarkXPct?: number;
    innerWatermarkYPct?: number;
    innerWatermarkWidthPct?: number;
    innerWatermarkAspect?: number;
    headerFooterProps: HeaderFooterBlockProps;
};

export function buildPdfInnerPageCommonProps(
    shell: PdfCompositorShell,
    settings: ProposalSettings,
    budget: Budget,
    pdfEmbeddedImages?: PdfEmbeddedImages,
    omitDocumentWatermark = false,
): PdfInnerPageCommonProps {
    return {
        settings,
        budget,
        pdfEmbeddedImages,
        docWatermarkSrc: shell.docWatermarkSrc,
        docWatermarkOpacity: shell.effectiveInnerWatermarkOpacity,
        omitDocumentWatermark,
        innerHeaderText: shell.innerHeaderText,
        innerFooterText: shell.innerFooterText,
        showInnerHeaderBand: shell.headerFooterProps.inner_show_header_band === true,
        showInnerFooterBand: shell.headerFooterProps.inner_show_footer_band === true,
        innerHeaderHeight: shell.headerFooterProps.inner_header_height,
        innerFooterHeight: shell.headerFooterProps.inner_footer_height,
        innerWatermarkScalePct: shell.innerWatermarkScalePct,
        innerWatermarkXPct: shell.innerWatermarkXPct,
        innerWatermarkYPct: shell.innerWatermarkYPct,
        innerWatermarkWidthPct: shell.innerWatermarkWidthPct,
        innerWatermarkAspect: shell.innerWatermarkAspect,
        headerFooterProps: shell.headerFooterProps,
    };
}

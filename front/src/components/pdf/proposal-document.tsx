
import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { Budget } from '@/types/budget-types';
import { ProposalSettings } from '@/actions/settings-actions';
import { theme } from './theme';
import { BudgetTable } from './sections/budget-table';
import { CompositorCoverPdfPage } from './sections/compositor-cover-pdf';
import type { CompositorPdfPayload } from './compositor-pdf-types';
import {
    type BudgetBlock,
    flattenTree,
    type HeaderFooterBlockProps,
    DEFAULT_HEADER_FOOTER_PROPS,
} from '@/types/budget-compositor-types';
import { mergeCoverDocumentProps, resolveInnerPagesWatermark } from '@/lib/budgets/cover-document';
import { type PdfEmbeddedImages, proxyPdfImageSrc } from '@/lib/pdf/pdf-image-src';
import { splitCoverHtmlFragmentToSegments, splitCoverHtmlIntoPdfBlocks } from '@/lib/pdf/cover-pdf-blocks';
import { stripHtmlToText } from '@/lib/pdf/html-to-plain-text';
import { sanitizeCoverHtmlForPdf } from '@/lib/pdf/sanitize-inline-styles-for-pdf';
import { sanitizeTextForPdf } from '@/lib/pdf/sanitize-pdf-text';
import {
    PDF_SCENE_IMAGE_LEAD_H,
    placeSceneImageInPaginationEstimate,
    type SceneImagePaginationState,
} from '@/lib/pdf/scene-image-page-breaks';
import { pdfInnerRunningHeaderShouldShow } from '@/lib/pdf/pdf-proposal-header';
import { PdfProposalHeaderBand } from '@/components/pdf/pdf-proposal-header-band';
import {
    HeaderFooterPdfLayer,
    PaginationProbeText,
    hasAnyHeaderFooterPdfLayout,
    renderTextWithPageNumbers,
} from '@/components/pdf/header-footer-layout-pdf';
import type { BudgetItem } from '@/types/budget-types';
import type { BudgetLocation } from '@/types/budget-types';
import { applyQuoteRowAdjustments } from '@/lib/budgets/scope-pricing';
import {
    getCompositorPanelLabel,
    getScopeBlockLabel,
} from '@/components/budgets/compositor/compositor-content-utils';
import {
    filterIntroTocEntries,
    isIntroTocEntry,
} from '@/components/budgets/compositor/compositor-toc-utils';

interface ProposalDocumentProps {
    budget: Budget;
    settings: ProposalSettings;
    /** Quando presente, sumário/lista de figuras seguem o compositor; detalhamento continua pelo Escopo (`locations`). */
    compositorPdf?: CompositorPdfPayload;
    /** Evita marca d’água nas páginas internas (útil se imagem remota corromper o layout). */
    omitDocumentWatermark?: boolean;
    /** Data URIs pré-carregadas na rota API (evita `fetch` HTTP durante `renderToBuffer`). */
    pdfEmbeddedImages?: PdfEmbeddedImages;
    /**
     * Segunda passada do PDF: páginas iniciais reais de cada segmento (`detail`, `session:<id>`),
     * coletadas na primeira renderização.
     */
    resolvedPagination?: ProposalResolvedPagination;
    /** Primeira passada do PDF: coletor mutável de páginas iniciais por segmento. */
    paginationCollector?: ProposalPaginationCollector;
}

function mergeHeaderFooterProps(raw: Record<string, unknown> | undefined): HeaderFooterBlockProps {
    return {
        ...DEFAULT_HEADER_FOOTER_PROPS,
        ...(raw ?? {}),
    };
}

function htmlBandToPlainText(html: string | undefined): string {
    return sanitizeTextForPdf(stripHtmlToText(String(html ?? ""))).trim();
}

function editorBandHeightToPt(value: unknown, fallbackPx: number): number {
    const n = typeof value === "number" ? value : Number(value);
    const px = Number.isFinite(n) ? n : fallbackPx;
    return Math.max(18, Math.min(180, px * EDITOR_PX_TO_PT));
}

function resolvePdfWatermarkBox(
    xPct: number,
    yPct: number,
    widthPct: number,
    aspect: number
): { left: number; top: number; width: number; height: number } {
    const safeAspect = aspect > 0 ? aspect : 1;
    const wPct = Math.max(8, Math.min(95, widthPct));
    const x = Math.max(0, Math.min(100 - wPct, xPct));
    const w = (wPct / 100) * PDF_PAGE_W;
    const h = w / safeAspect;
    const maxYPct = Math.max(0, 100 - (h / PDF_PAGE_H) * 100);
    const y = Math.max(0, Math.min(maxYPct, yPct));
    return {
        left: (x / 100) * PDF_PAGE_W,
        top: (y / 100) * PDF_PAGE_H,
        width: w,
        height: h,
    };
}

export type ProposalResolvedPagination = {
    segmentStartPages?: Record<string, number>;
};

export type ProposalPaginationCollector = {
    segmentStartPages: Record<string, number>;
};

type CompositorQuoteSection = {
    id: string;
    title: string;
    items: BudgetItem[];
};

type CompositorQuoteLocation = {
    id: string;
    title: string;
    sections: CompositorQuoteSection[];
};

type PdfFigureEntry = {
    id: string;
    caption: string;
};

/** A4 em pt (igual `compositor-cover-pdf`) — Yoga precisa de largura explícita na camada absoluta. */
const PDF_PAGE_W = 595.28;
const PDF_PAGE_H = 841.89;
const INNER_PAD = 35;
const EDITOR_A4_HEIGHT_PX = 1122;
const EDITOR_PX_TO_PT = PDF_PAGE_H / EDITOR_A4_HEIGHT_PX;
const ABNT_PARAGRAPH_INDENT = "\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0";

const styles = StyleSheet.create({
    pageWithWatermark: {
        position: 'relative',
    },
    /** Igual `compositor-cover-pdf` (`watermarkLayer`): primeiro filho = pintado por baixo (evita bugs de `zIndex` no react-pdf). */
    documentWatermarkLayer: {
        position: 'absolute',
        left: 0,
        width: PDF_PAGE_W,
        justifyContent: 'center',
        alignItems: 'center',
    },
    /** Mesmas dimensões que `watermarkImg` na capa (0,82 × A4). */
    documentWatermarkImage: {
        width: Math.round(PDF_PAGE_W * 0.82),
        height: Math.round(PDF_PAGE_H * 0.82),
        objectFit: 'contain',
    },
    /** `Page` interno sem padding — o recuo fica só no corpo (evita clipping da marca absoluta). */
    innerPageRoot: {
        position: 'relative',
        fontFamily: theme.fonts.body,
        fontSize: 11,
        color: theme.colors.text,
    },
    /** Conteúdo por cima da marca (fundos transparentes — só texto/tabelas tapam a arte). */
    innerPageForeground: {
        position: 'relative',
    },
    innerPageContentWrap: {
        position: 'relative',
    },
    contentPage: {
        padding: 35,
        paddingTop: 35,
        paddingBottom: 50,
        fontFamily: theme.fonts.body,
        fontSize: 11,
        color: theme.colors.text,
    },
    /** Título da seção (faixa de empresa fixa fica acima, igual à capa). */
    segmentHeader: {
        marginBottom: 14,
        borderBottomWidth: 2,
        borderBottomColor: theme.colors.secondary,
        paddingBottom: 5,
    },
    runningHeaderBand: {
        position: 'absolute',
        top: INNER_PAD,
        left: INNER_PAD,
        right: INNER_PAD,
        minHeight: 98,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    runningFooterBand: {
        position: 'absolute',
        bottom: INNER_PAD,
        left: INNER_PAD,
        right: INNER_PAD,
        minHeight: 36,
        paddingTop: 6,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    runningFooterMuted: {
        fontSize: 8,
        color: theme.colors.textLight,
    },
    runningFooterPage: {
        fontSize: 9,
        color: theme.colors.textLight,
    },
    headerTitle: {
        color: theme.colors.primary,
        fontFamily: theme.fonts.bold,
        fontSize: 14,
        textTransform: 'uppercase'
    },
    tocRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginBottom: 8,
    },
    tocDots: {
        flex: 1,
        minWidth: 24,
        borderBottomWidth: 0.5,
        borderBottomColor: '#888',
        marginHorizontal: 6,
        marginBottom: 3,
    },
    tocTitle: {
        fontSize: 10,
        flexShrink: 0,
        maxWidth: 380,
    },
    tocPage: {
        fontSize: 10,
        fontFamily: theme.fonts.bold,
    },
    sessionTitle: {
        fontSize: 13,
        fontFamily: theme.fonts.bold,
        color: theme.colors.primary,
        marginBottom: 10,
        textTransform: 'uppercase',
    },
    sessionRow: {
        marginBottom: 8,
        borderBottomWidth: 0.5,
        borderBottomColor: theme.colors.border,
        paddingBottom: 6,
    },
    sessionRowTitle: {
        fontSize: 10,
        fontFamily: theme.fonts.bold,
        color: theme.colors.text,
        marginBottom: 2,
    },
    sessionRowText: {
        fontSize: 9,
        color: theme.colors.text,
        lineHeight: 1.35,
    },
    sessionRichHeading: {
        fontSize: 10,
        fontFamily: theme.fonts.bold,
        color: theme.colors.text,
        marginBottom: 2,
    },
    sessionRichParagraph: {
        fontSize: 9,
        color: theme.colors.text,
        lineHeight: 1.35,
        marginBottom: 2,
    },
    sessionRichParagraphSpacer: {
        height: 10,
    },
    sessionImageFrame: {
        width: '100%',
        alignItems: 'center',
        marginTop: 4,
        marginBottom: 6,
    },
    sessionRichImageBase: {
        objectFit: 'contain',
        objectPosition: 'center',
    },
    sessionGalleryImageBase: {
        objectFit: 'contain',
        objectPosition: 'center',
    },
    quoteCard: {
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 8,
        overflow: 'hidden',
    },
    quoteHeaderBar: {
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
        backgroundColor: '#eff6ff',
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    quoteHeaderTitle: {
        fontSize: 9,
        fontFamily: theme.fonts.bold,
        color: '#0f172a',
        textTransform: 'uppercase',
        textAlign: 'center',
        letterSpacing: 1.1,
    },
    quoteTableHeader: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
        backgroundColor: '#f9fafb',
        paddingVertical: 8,
        paddingHorizontal: 4,
    },
    quoteHeaderCell: {
        fontSize: 8,
        fontFamily: theme.fonts.bold,
        color: '#6b7280',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        paddingHorizontal: 10,
    },
    quoteRow: {
        flexDirection: 'row',
        borderBottomWidth: 0.5,
        borderBottomColor: '#f1f5f9',
        paddingVertical: 7,
        paddingHorizontal: 4,
        alignItems: 'center',
    },
    quoteColIndex: {
        width: 32,
        fontSize: 9,
        paddingHorizontal: 10,
        color: theme.colors.text,
    },
    quoteColDescWrap: {
        flex: 1,
        paddingRight: 8,
    },
    quoteColDescLoc: {
        fontSize: 9,
        fontFamily: theme.fonts.bold,
        color: '#0f172a',
        borderLeftWidth: 3,
        borderLeftColor: theme.colors.primary,
        paddingLeft: 8,
    },
    quoteColDescSec: {
        fontSize: 8.5,
        color: theme.colors.textLight,
        paddingLeft: 14,
    },
    quoteColMoney: {
        width: 72,
        fontSize: 9,
        textAlign: 'right',
        paddingHorizontal: 10,
        color: theme.colors.text,
    },
    quoteColMoneyBold: {
        width: 72,
        fontSize: 9,
        fontFamily: theme.fonts.bold,
        textAlign: 'right',
        paddingHorizontal: 10,
        color: '#0f172a',
    },
    quoteLocRow: {
        backgroundColor: '#f5f7ff',
    },
    quoteSecRow: {
        backgroundColor: '#ffffff',
    },
    quoteTotalRow: {
        flexDirection: 'row',
        borderTopWidth: 2,
        borderTopColor: '#fcd34d',
        backgroundColor: '#fef3c7',
        paddingVertical: 10,
        paddingHorizontal: 4,
        alignItems: 'center',
    },
    quoteTotalLabel: {
        flex: 1,
        fontSize: 8,
        fontFamily: theme.fonts.bold,
        textTransform: 'uppercase',
        textAlign: 'right',
        color: '#78350f',
        letterSpacing: 0.6,
        paddingRight: 8,
    },
    quoteTotalValue: {
        width: 72,
        fontSize: 9,
        fontFamily: theme.fonts.bold,
        textAlign: 'right',
        paddingHorizontal: 10,
        color: '#78350f',
    },
    quoteFooterLabelsRow: {
        flexDirection: 'row',
        backgroundColor: '#fffbeb',
        borderTopWidth: 1,
        borderTopColor: '#fde68a',
        paddingVertical: 6,
        paddingHorizontal: 4,
    },
    quoteFooterLabel: {
        width: 72,
        fontSize: 7,
        fontFamily: theme.fonts.bold,
        textTransform: 'uppercase',
        textAlign: 'right',
        paddingHorizontal: 10,
        color: '#92400e',
        letterSpacing: 0.5,
    },
});

/** Indentação no PDF: `Math.min(depth, 6)` com depth negativo devolve o próprio negativo (ex.: ID mal tipado) e quebra o Yoga. */
function safeLayoutIndentDepth(raw: unknown, maxDepth: number): number {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) return 0;
    const i = Math.trunc(n);
    if (i < 0) return 0;
    return Math.min(i, maxDepth);
}

function collectSessionPrintRows(
    sessionRoot: BudgetBlock,
    itemsByBlock: Record<string, BudgetItem[]>,
    imagesByBlock: Record<string, Array<{ url?: string; composed_url?: string }>>
): Array<{ depth: number; title: string; html: string; extraText?: string; blockImageUrls: string[] }> {
    const rows: Array<{ depth: number; title: string; html: string; extraText?: string; blockImageUrls: string[] }> = [];
    const resolveBlockImageUrls = (blockId: string): string[] =>
        (imagesByBlock[blockId] ?? [])
            .map((img) => (img.composed_url || img.url || "").trim())
            .filter(Boolean);
    const visit = (node: BudgetBlock, depth: number) => {
        if (node.type === 'session') {
            const html = String((node.props?.description as string) || '');
            rows.push({
                depth,
                title: `${node.number ? `${node.number} ` : ''}${(node.label || 'Sessão').trim()}`,
                html,
                blockImageUrls: resolveBlockImageUrls(node.id),
            });
        } else if (node.type === 'text') {
            const html = String((node.props?.content as string) || '');
            rows.push({
                depth,
                title: 'Texto',
                html,
                blockImageUrls: resolveBlockImageUrls(node.id),
            });
        } else if (node.type === 'location') {
            const html = String((node.props?.description as string) || '');
            rows.push({
                depth,
                title: `Local: ${(node.label || 'Local').trim()}`,
                html,
                blockImageUrls: resolveBlockImageUrls(node.id),
            });
        } else if (node.type === 'section') {
            const html = String((node.props?.description as string) || '');
            const count = itemsByBlock[node.id]?.length ?? 0;
            rows.push({
                depth,
                title: `Trecho: ${(node.label || 'Trecho').trim()}`,
                html,
                extraText: count > 0 ? `${count} item(ns) vinculados.` : undefined,
                blockImageUrls: resolveBlockImageUrls(node.id),
            });
        }
        node.children.forEach((child) => visit(child, depth + 1));
    };
    visit(sessionRoot, 0);
    return rows;
}

function readQuoteSplitPercents(b: Budget): {
    markupEquip: number;
    discountEquip: number;
    markupAsm: number;
    discountAsm: number;
} {
    const r = b as unknown as Record<string, unknown>;
    const legacyMarkup = Number(r.quote_markup_percent ?? 0);
    const legacyDiscount = Number(r.quote_discount_percent ?? 0);
    const hasExplicitSplit =
        r.quote_markup_equipment_percent !== undefined ||
        r.quote_discount_equipment_percent !== undefined ||
        r.quote_markup_assembly_percent !== undefined ||
        r.quote_discount_assembly_percent !== undefined;
    if (hasExplicitSplit) {
        return {
            markupEquip: Number(r.quote_markup_equipment_percent ?? 0),
            discountEquip: Number(r.quote_discount_equipment_percent ?? 0),
            markupAsm: Number(r.quote_markup_assembly_percent ?? 0),
            discountAsm: Number(r.quote_discount_assembly_percent ?? 0),
        };
    }
    return {
        markupEquip: legacyMarkup,
        discountEquip: legacyDiscount,
        markupAsm: legacyMarkup,
        discountAsm: legacyDiscount,
    };
}

function computeSectionEquipAssembly(items: BudgetItem[]): { equipment: number; assembly: number } {
    let equipment = 0;
    let assembly = 0;
    for (const item of items) {
        const qty = Number(item.quantity ?? 0);
        const unit = Number(item.unit_price ?? 0);
        const labor = Number(item.labor_cost ?? 0);
        const baseEquip = qty * unit;
        const baseAssembly = qty * labor;
        const base = baseEquip + baseAssembly;
        const explicitTotal = Number(item.total ?? 0);
        if (Number.isFinite(explicitTotal) && explicitTotal > 0 && base > 0) {
            const ratioEquip = baseEquip / base;
            const ratioAssembly = baseAssembly / base;
            equipment += explicitTotal * ratioEquip;
            assembly += explicitTotal * ratioAssembly;
        } else {
            equipment += Number.isFinite(baseEquip) ? baseEquip : 0;
            assembly += Number.isFinite(baseAssembly) ? baseAssembly : 0;
        }
    }
    return { equipment, assembly };
}

function collectCompositorQuoteLocations(
    roots: BudgetBlock[],
    itemsByBlock: Record<string, BudgetItem[]>
): CompositorQuoteLocation[] {
    const out: CompositorQuoteLocation[] = [];

    const collectSections = (node: BudgetBlock, acc: CompositorQuoteSection[]) => {
        if (node.type === "section") {
            acc.push({
                id: node.id,
                title: (node.label || "Trecho").trim() || "Trecho",
                items: itemsByBlock[node.id] ?? [],
            });
        }
        for (const child of node.children) collectSections(child, acc);
    };

    const visit = (node: BudgetBlock) => {
        if (node.type === "location") {
            const sections: CompositorQuoteSection[] = [];
            for (const child of node.children) collectSections(child, sections);
            out.push({
                id: node.id,
                title: (node.label || "Local").trim() || "Local",
                sections,
            });
        }
        for (const child of node.children) visit(child);
    };

    for (const root of roots) visit(root);
    return out;
}

function collectScopeQuoteLocations(locations: BudgetLocation[] | undefined): CompositorQuoteLocation[] {
    const out: CompositorQuoteLocation[] = [];
    for (const loc of locations ?? []) {
        const sections = (loc.sections ?? []).map((sec) => ({
            id: String(sec.id ?? `${loc.id}-sec-${sec.order_index ?? 0}`),
            title: (sec.name || "Trecho").trim() || "Trecho",
            items: sec.items ?? [],
        }));
        out.push({
            id: String(loc.id ?? `loc-${loc.order_index ?? 0}`),
            title: (loc.name || "Local").trim() || "Local",
            sections,
        });
    }
    return out;
}

/** Mesma origem de imagens exibidas no detalhamento (`BudgetTable`): 1ª imagem de cada trecho. */
function collectRenderedPdfFigureEntries(locations: BudgetLocation[] | undefined): PdfFigureEntry[] {
    const out: PdfFigureEntry[] = [];
    const seen = new Set<string>();
    for (const loc of locations ?? []) {
        for (const sec of loc.sections ?? []) {
            const firstImg = (sec.images ?? [])[0];
            if (!firstImg?.id) continue;
            const id = String(firstImg.id);
            if (seen.has(id)) continue;
            seen.add(id);
            const rawCaption =
                typeof firstImg.caption === "string" && firstImg.caption.trim()
                    ? firstImg.caption.trim()
                    : `Imagem padrão — ${(sec.name || "Trecho").trim() || "Trecho"}`;
            out.push({ id, caption: rawCaption });
        }
    }
    return out;
}

function estimateRenderedFigurePagesFromScope(
    locations: BudgetLocation[] | undefined,
    detailStartPage: number,
    opts: { showRunningHeader: boolean; showCosts: boolean; costsDisplayMode: "location" | "section" | "general" }
): Record<string, number> {
    const out: Record<string, number> = {};
    const pageContentMax =
        PDF_PAGE_H -
        (INNER_PAD + (opts.showRunningHeader ? INNER_HEADER_RESERVE : 0)) -
        (INNER_PAD + INNER_FOOTER_RESERVE) -
        28; // faixa do título da seção
    let page = Math.max(1, Math.trunc(detailStartPage || 1));
    let y = 0;
    const sceneState: SceneImagePaginationState = { page, y, imagesSeen: 0 };

    const syncSceneState = () => {
        page = sceneState.page;
        y = sceneState.y;
    };

    const ensureSpace = (h: number) => {
        if (y > 0 && y + h > pageContentMax) {
            page += 1;
            y = 0;
        }
    };
    const addHeight = (h: number) => {
        ensureSpace(h);
        y += h;
        sceneState.page = page;
        sceneState.y = y;
    };

    for (const [locIdx, loc] of (locations ?? []).entries()) {
        if (locIdx > 0 && sceneState.imagesSeen > 0) {
            sceneState.page += 1;
            sceneState.y = 0;
            syncSceneState();
        }
        addHeight(38); // locationHeader aprox.
        const locationImgs = (loc.images ?? []).filter((img) => !!img?.id);
        for (let imgIdx = 0; imgIdx < locationImgs.length; imgIdx++) {
            const img = locationImgs[imgIdx];
            syncSceneState();
            out[String(img.id)] = placeSceneImageInPaginationEstimate(sceneState, pageContentMax, {
                leadHeight: imgIdx === 0 ? PDF_SCENE_IMAGE_LEAD_H : 0,
            });
            syncSceneState();
        }
        const locHasPhotos = locationImgs.length > 0;
        const sectionsHaveScenes = (loc.sections ?? []).some(
            (sec) => (sec.images ?? []).filter((img) => !!img?.id).length > 0
        );
        const breakBetweenLocPhotosAndSections = locHasPhotos && sectionsHaveScenes;
        if (breakBetweenLocPhotosAndSections) {
            sceneState.page += 1;
            sceneState.y = 0;
            syncSceneState();
        }
        let firstSectionWithScenesHandled = false;
        for (const sec of loc.sections ?? []) {
            const sectionImgs = (sec.images ?? []).filter((img) => !!img?.id);
            const isFirstSectionWithScenes =
                sectionImgs.length > 0 && !firstSectionWithScenesHandled;
            if (isFirstSectionWithScenes) {
                firstSectionWithScenesHandled = true;
            }
            if (sectionImgs.length === 0) {
                addHeight(22); // sectionTitle aprox.
            }
            for (let imgIdx = 0; imgIdx < sectionImgs.length; imgIdx++) {
                const img = sectionImgs[imgIdx];
                syncSceneState();
                const suppressFirstSectionBreak =
                    breakBetweenLocPhotosAndSections &&
                    isFirstSectionWithScenes &&
                    imgIdx === 0;
                out[String(img.id)] = placeSceneImageInPaginationEstimate(sceneState, pageContentMax, {
                    leadHeight: imgIdx === 0 ? 22 : 0,
                    suppressBreak: suppressFirstSectionBreak,
                });
                syncSceneState();
            }
            const rows = (sec.items ?? []).length;
            const tableH = 16 + rows * 17 + (opts.showCosts && opts.costsDisplayMode === "section" ? 14 : 0);
            if (sectionImgs.length > 0) {
                // Tabela na mesma folha da última foto do trecho.
                addHeight(Math.max(24, tableH));
            } else {
                addHeight(22 + Math.max(24, tableH));
            }
        }
        if (opts.showCosts && opts.costsDisplayMode === "location") {
            addHeight(14);
        }
        addHeight(10);
    }
    if (opts.showCosts && opts.costsDisplayMode === "general") {
        addHeight(16);
    }
    return out;
}

function estimateDetailTocRowsFromScope(
    locations: BudgetLocation[] | undefined,
    params: {
        sectionNumber: number;
        detailStartPage: number;
        showRunningHeader: boolean;
        showCosts: boolean;
        costsDisplayMode: "location" | "section" | "general";
        detailTitle: string;
    }
): Array<{ number: string; title: string; depth: number; page: number }> {
    const out: Array<{ number: string; title: string; depth: number; page: number }> = [];
    const pageContentMax =
        PDF_PAGE_H -
        (INNER_PAD + (params.showRunningHeader ? INNER_HEADER_RESERVE : 0)) -
        (INNER_PAD + INNER_FOOTER_RESERVE) -
        28; // faixa do título da seção
    let page = Math.max(1, Math.trunc(params.detailStartPage || 1));
    let y = 0;
    const sceneState: SceneImagePaginationState = { page, y, imagesSeen: 0 };

    const syncSceneState = () => {
        page = sceneState.page;
        y = sceneState.y;
    };

    const ensureSpace = (h: number) => {
        if (y > 0 && y + h > pageContentMax) {
            page += 1;
            y = 0;
        }
    };
    const addHeight = (h: number) => {
        ensureSpace(h);
        y += h;
        sceneState.page = page;
        sceneState.y = y;
    };

    const addSceneImageHeight = (opts?: { leadHeight?: number }) => {
        syncSceneState();
        placeSceneImageInPaginationEstimate(sceneState, pageContentMax, opts);
        syncSceneState();
    };

    // Capítulo raiz de Adequações no sumário
    out.push({
        number: String(params.sectionNumber),
        title: params.detailTitle,
        depth: 0,
        page,
    });

    for (const [locIdx, loc] of (locations ?? []).entries()) {
        const locNum = `${params.sectionNumber}.${locIdx + 1}`;
        if (locIdx > 0 && sceneState.imagesSeen > 0) {
            sceneState.page += 1;
            sceneState.y = 0;
            syncSceneState();
        }
        ensureSpace(38); // locationHeader aprox.
        out.push({
            number: locNum,
            title: (loc.name || "Local").trim() || "Local",
            depth: 1,
            page,
        });
        addHeight(38);
        const locationImgs = (loc.images ?? []).filter((img) => !!img?.id);
        const locHasPhotos = locationImgs.length > 0;
        for (let imgIdx = 0; imgIdx < locationImgs.length; imgIdx++) {
            addSceneImageHeight({
                leadHeight: imgIdx === 0 ? PDF_SCENE_IMAGE_LEAD_H : 0,
            });
        }

        const sectionsHaveScenes = (loc.sections ?? []).some(
            (sec) => (sec.images ?? []).filter((img) => !!img?.id).length > 0
        );
        const breakBetweenLocPhotosAndSections = locHasPhotos && sectionsHaveScenes;
        if (breakBetweenLocPhotosAndSections) {
            sceneState.page += 1;
            sceneState.y = 0;
            syncSceneState();
        }
        let firstSectionWithScenesHandled = false;

        for (const [secIdx, sec] of (loc.sections ?? []).entries()) {
            const secNum = `${locNum}.${secIdx + 1}`;
            const sectionImgs = (sec.images ?? []).filter((img) => !!img?.id);
            const isFirstSectionWithScenes =
                sectionImgs.length > 0 && !firstSectionWithScenesHandled;
            if (isFirstSectionWithScenes) {
                firstSectionWithScenesHandled = true;
            }
            if (sectionImgs.length === 0) {
                ensureSpace(22); // sectionTitle aprox.
                out.push({
                    number: secNum,
                    title: (sec.name || "Trecho").trim() || "Trecho",
                    depth: 2,
                    page,
                });
                addHeight(22);
            } else {
                syncSceneState();
                const sectionPage = placeSceneImageInPaginationEstimate(sceneState, pageContentMax, {
                    leadHeight: 22,
                    suppressBreak:
                        breakBetweenLocPhotosAndSections && isFirstSectionWithScenes,
                });
                syncSceneState();
                out.push({
                    number: secNum,
                    title: (sec.name || "Trecho").trim() || "Trecho",
                    depth: 2,
                    page: sectionPage,
                });
                for (let imgIdx = 1; imgIdx < sectionImgs.length; imgIdx++) {
                    addSceneImageHeight();
                }
            }

            const rows = (sec.items ?? []).length;
            const tableH =
                16 + rows * 17 + (params.showCosts && params.costsDisplayMode === "section" ? 14 : 0);
            addHeight(Math.max(24, tableH));
        }

        if (params.showCosts && params.costsDisplayMode === "location") {
            addHeight(14);
        }
        addHeight(10);
    }

    if (params.showCosts && params.costsDisplayMode === "general") {
        addHeight(16);
    }
    return out;
}

type PdfSegment =
    | { kind: "cover" }
    | { kind: "toc" }
    | { kind: "figures" }
    | { kind: "quote" }
    | { kind: "detail" }
    | { kind: "session"; block: BudgetBlock }
    | { kind: "terms" };

function htmlHasVisibleText(raw: unknown): boolean {
    const html = String(raw ?? "");
    if (!html.trim()) return false;
    const plain = html
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    return plain.length > 0;
}

function hasPrintableBlockContent(
    node: BudgetBlock,
    itemsByBlock: Record<string, BudgetItem[]>,
    imagesByBlock: Record<string, Array<{ url?: string; composed_url?: string }>>
): boolean {
    const blockImages = imagesByBlock[node.id] ?? [];
    const hasImages = blockImages.some((img) => {
        const raw = (img.composed_url || img.url || "").trim();
        return raw.length > 0;
    });
    if (hasImages) return true;

    if (node.type === "session" || node.type === "location") {
        return htmlHasVisibleText(node.props?.description);
    }
    if (node.type === "text") {
        return htmlHasVisibleText(node.props?.content);
    }
    if (node.type === "section") {
        if (htmlHasVisibleText(node.props?.description)) return true;
        const count = itemsByBlock[node.id]?.length ?? 0;
        return count > 0;
    }
    return false;
}

function hasPrintableSessionSubtree(
    sessionRoot: BudgetBlock,
    itemsByBlock: Record<string, BudgetItem[]>,
    imagesByBlock: Record<string, Array<{ url?: string; composed_url?: string }>>
): boolean {
    if (hasPrintableBlockContent(sessionRoot, itemsByBlock, imagesByBlock)) return true;
    for (const child of sessionRoot.children) {
        if (hasPrintableSessionSubtree(child, itemsByBlock, imagesByBlock)) return true;
    }
    return false;
}

function buildPdfSegmentsFromCompositorRoots(
    roots: BudgetBlock[],
    includeFiguresPage: boolean,
    itemsByBlock: Record<string, BudgetItem[]>,
    imagesByBlock: Record<string, Array<{ url?: string; composed_url?: string }>>
): PdfSegment[] {
    const segments: PdfSegment[] = [];
    let placedQuote = false;
    let placedDetail = false;
    for (const b of roots) {
        if (b.type === "cover") {
            segments.push({ kind: "cover" });
        } else if (b.type === "toc") {
            segments.push({ kind: "toc" });
        } else if (b.type === "figures" && includeFiguresPage) {
            segments.push({ kind: "figures" });
        } else if (b.type === "quote" && !placedQuote) {
            segments.push({ kind: "quote" });
            placedQuote = true;
        } else if (b.type === "scope" && !placedDetail) {
            segments.push({ kind: "detail" });
            placedDetail = true;
        } else if (
            b.type === "session" &&
            hasPrintableSessionSubtree(b, itemsByBlock, imagesByBlock)
        ) {
            segments.push({ kind: "session", block: b });
        }
    }
    if (!placedQuote && !placedDetail) {
        // Retrocompatibilidade: orçamentos sem blocos quote/scope ainda imprimem detalhamento.
        segments.push({ kind: "detail" });
    }
    segments.push({ kind: "terms" });
    return segments;
}

function defaultPdfSegmentsNoCompositor(): PdfSegment[] {
    return [{ kind: "cover" }, { kind: "quote" }, { kind: "detail" }, { kind: "terms" }];
}

function assignPdfSegmentPages(segments: PdfSegment[]): {
    quotePage: number;
    detailPage: number;
    sessionPages: Map<string, number>;
} {
    let p = 1;
    let quotePage = 1;
    let detailPage = 1;
    const sessionPages = new Map<string, number>();
    for (const seg of segments) {
        if (seg.kind === "cover" || seg.kind === "toc" || seg.kind === "figures") {
            p += 1;
        } else if (seg.kind === "quote") {
            quotePage = p;
            p += 1;
        } else if (seg.kind === "detail") {
            detailPage = p;
            p += 1;
        } else if (seg.kind === "session") {
            sessionPages.set(seg.block.id, p);
            p += 1;
        } else if (seg.kind === "terms") {
            p += 1;
        }
    }
    return { quotePage, detailPage, sessionPages };
}

function collectSessionTocRowsForPrintedLayout(
    roots: BudgetBlock[],
    sessionPages: Map<string, number>,
    itemsByBlock: Record<string, BudgetItem[]>,
    imagesByBlock: Record<string, Array<{ url?: string; composed_url?: string }>>
): Array<{ number: string; title: string; depth: number; page: number }> {
    const out: Array<{ number: string; title: string; depth: number; page: number }> = [];
    const sessionRoots = roots.filter((b) => b.type === "session");

    const collectSessionsDfs = (node: BudgetBlock, page: number) => {
        if (node.type === "session") {
            if (!hasPrintableSessionSubtree(node, itemsByBlock, imagesByBlock)) {
                return;
            }
            const title = (node.label || "Sessão").trim() || "Sessão";
            if (isIntroTocEntry(title)) {
                return;
            }
            out.push({
                number: node.number || "",
                title,
                depth: safeLayoutIndentDepth(node.depth, 24),
                page: Number.isFinite(page) && page > 0 ? Math.min(Math.trunc(page), 99999) : 1,
            });
        }
        node.children.forEach((child) => collectSessionsDfs(child, page));
    };

    for (const root of sessionRoots) {
        const page = sessionPages.get(root.id) ?? 1;
        collectSessionsDfs(root, page);
    }
    return out;
}

const INNER_HEADER_RESERVE = 108;
const INNER_FOOTER_RESERVE = 44;
const INNER_PAGE_H = PDF_PAGE_H;

/** Páginas internas: faixas fixas (logo + empresa; código + páginas) como na capa; marca d’água entre as faixas. */
function InnerPdfPage({
    pageKey,
    title,
    children,
    settings,
    budget,
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
    innerWatermarkXPct,
    innerWatermarkYPct,
    innerWatermarkWidthPct,
    innerWatermarkAspect,
    headerFooterProps,
}: {
    pageKey: string;
    title: string;
    children: React.ReactNode;
    settings: ProposalSettings;
    budget: Budget;
    pdfEmbeddedImages?: PdfEmbeddedImages;
    docWatermarkSrc: string | undefined;
    docWatermarkOpacity: number;
    omitDocumentWatermark: boolean;
    /** Ex.: `{ flexDirection: 'column' }` na página de condições. */
    pageStyleExtra?: { flexDirection?: "row" | "column" };
    /** Chave estável do segmento para coletar a página inicial real na 1ª passada. */
    paginationProbeKey?: string;
    paginationCollector?: ProposalPaginationCollector;
    innerHeaderText?: string;
    innerFooterText?: string;
    showInnerHeaderBand?: boolean;
    showInnerFooterBand?: boolean;
    innerHeaderHeight?: number;
    innerFooterHeight?: number;
    innerWatermarkScalePct?: number;
    innerWatermarkXPct?: number;
    innerWatermarkYPct?: number;
    innerWatermarkWidthPct?: number;
    innerWatermarkAspect?: number;
    headerFooterProps?: HeaderFooterBlockProps;
}) {
    const fill = settings.pdf_header_fill_from_settings === true;
    const company = fill
        ? sanitizeTextForPdf(settings.company_name?.trim() || "")
        : "";
    const logoUrl = fill ? settings.company_logo_url?.trim() : undefined;
    const logoSrc = logoUrl
        ? proxyPdfImageSrc(logoUrl, settings.app_public_url, pdfEmbeddedImages)
        : undefined;
    const showRunningHeader = showInnerHeaderBand && pdfInnerRunningHeaderShouldShow(settings);
    const code = sanitizeTextForPdf((budget.code || "").trim() || "—");
    const customHeader = showInnerHeaderBand ? (innerHeaderText ?? "").trim() : "";
    const customFooter = showInnerFooterBand ? (innerFooterText ?? "").trim() : "";
    const innerHeaderLayouts = [headerFooterProps?.all_header_layout, headerFooterProps?.inner_header_layout];
    const innerFooterLayouts = [headerFooterProps?.all_footer_layout, headerFooterProps?.inner_footer_layout];
    const hasInnerHeaderLayout = hasAnyHeaderFooterPdfLayout(innerHeaderLayouts);
    const hasInnerFooterLayout = hasAnyHeaderFooterPdfLayout(innerFooterLayouts);
    const customHeaderReserve = editorBandHeightToPt(innerHeaderHeight, INNER_HEADER_RESERVE);
    const customFooterReserve = editorBandHeightToPt(innerFooterHeight, INNER_FOOTER_RESERVE);
    const headerReserve =
        showInnerHeaderBand && (customHeader || hasInnerHeaderLayout)
            ? customHeaderReserve
            : (showRunningHeader ? INNER_HEADER_RESERVE : 0);
    const footerReserve = !showInnerFooterBand
        ? 0
        : customFooter || hasInnerFooterLayout
          ? customFooterReserve
          : INNER_FOOTER_RESERVE;

    const wmTop = headerReserve > 0 ? INNER_PAD + headerReserve : INNER_PAD;
    const wmHeight = Math.max(40, INNER_PAGE_H - wmTop - (INNER_PAD + footerReserve));
    const wmOpacity = Math.min(0.22, Math.max(docWatermarkOpacity, 0.08));
    const wmScale = Math.max(
        40,
        Math.min(220, Number.isFinite(innerWatermarkScalePct) ? Number(innerWatermarkScalePct) : 100)
    );
    const wmBox = resolvePdfWatermarkBox(
        Number(innerWatermarkXPct ?? 11),
        Number(innerWatermarkYPct ?? 11),
        Number(innerWatermarkWidthPct ?? 78),
        Number(innerWatermarkAspect ?? 1)
    );

    return (
        <Page
            key={pageKey}
            size="A4"
            style={[
                styles.innerPageRoot,
                styles.pageWithWatermark,
                {
                    paddingTop: INNER_PAD + headerReserve,
                    paddingBottom: INNER_PAD + footerReserve,
                    paddingHorizontal: INNER_PAD,
                },
            ]}
        >
            {/*
              `Page` tem wrap=true por defeito; ao partir conteúdo em várias folhas PDF, só nós `fixed`
              são repetidos em cada subpágina (@react-pdf/layout splitNodes). Sem isto a marca ficava
              só na primeira fatia (a capa costuma ser uma única subpágina).
            */}
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
                    {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
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
                                transform: `scale(${wmScale / 100})`,
                            },
                        ]}
                    />
                </View>
            ) : null}
            <View
                style={[
                    styles.innerPageContentWrap,
                    ...(pageStyleExtra ? [pageStyleExtra] : []),
                ]}
            >
                <View style={styles.innerPageForeground}>
                    <View style={styles.segmentHeader}>
                        <Text style={styles.headerTitle}>{title}</Text>
                    </View>
                    {children}
                </View>
            </View>
            {showInnerHeaderBand && (customHeader || showRunningHeader || hasInnerHeaderLayout) ? (
                <View
                    style={[
                        styles.runningHeaderBand,
                        {
                            ...(hasInnerHeaderLayout ? { top: 0, left: 0, right: 0 } : {}),
                            minHeight: hasInnerHeaderLayout || customHeader
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
                            "inner"
                        )
                    ) : showRunningHeader ? (
                        <PdfProposalHeaderBand settings={settings} logoSrc={logoSrc} companyName={company} />
                    ) : null}
                </View>
            ) : null}
            {showInnerFooterBand ? (
                <View
                    style={[
                        styles.runningFooterBand,
                        {
                            ...(hasInnerFooterLayout ? { bottom: 0, left: 0, right: 0 } : {}),
                            minHeight: customFooter || hasInnerFooterLayout
                                ? customFooterReserve
                                : INNER_FOOTER_RESERVE,
                            height: footerReserve || INNER_FOOTER_RESERVE,
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
                            height={footerReserve || INNER_FOOTER_RESERVE}
                            appPublicUrl={settings.app_public_url}
                            pdfEmbeddedImages={pdfEmbeddedImages}
                            pageNumbering={headerFooterProps?.page_numbering}
                        />
                    ) : (
                        customFooter ? (
                            renderTextWithPageNumbers(
                                customFooter,
                                styles.runningFooterMuted,
                                headerFooterProps?.page_numbering,
                                "inner"
                            )
                        ) : (
                            <Text style={styles.runningFooterMuted}>{`Cód. ${code}`}</Text>
                        )
                    )}
                </View>
            ) : null}
            <PaginationProbeText paginationCollector={paginationCollector} paginationProbeKey={paginationProbeKey} />
        </Page>
    );
}

export const ProposalDocument = ({
    budget,
    settings,
    compositorPdf,
    omitDocumentWatermark = false,
    pdfEmbeddedImages,
    resolvedPagination,
    paginationCollector,
}: ProposalDocumentProps) => {
    const extractImageUrlsFromHtml = (html: string): string[] => {
        const urls = new Set<string>();
        if (!html.trim()) return [];
        const add = (u: string | undefined) => {
            const t = (u || "").trim().replace(/^['"]|['"]$/g, "");
            if (!t || t.startsWith("blob:")) return;
            urls.add(t);
        };
        const imgRe = /<img\b[^>]*>/gi;
        let m: RegExpExecArray | null;
        while ((m = imgRe.exec(html)) !== null) {
            const tag = m[0];
            const src =
                tag.match(/\bsrc\s*=\s*"([^"]*)"/i)?.[1] ??
                tag.match(/\bsrc\s*=\s*'([^']*)'/i)?.[1] ??
                tag.match(/\bsrc\s*=\s*([^\s>]+)/i)?.[1];
            add(src);
        }
        const dataAttrRe = /\bdata-(?:src|image|url)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
        while ((m = dataAttrRe.exec(html)) !== null) {
            add((m[1] || m[2] || m[3] || "").trim());
        }
        const bgRe = /background-image\s*:\s*url\(([^)]+)\)/gi;
        while ((m = bgRe.exec(html)) !== null) {
            add(m[1]);
        }
        return [...urls];
    };
    const rewriteImgSrcInHtml = (html: string): string => {
        if (!html.trim()) return html;
        return html.replace(/<img\b[^>]*>/gi, (tag) => {
            const m = tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
            if (!m) return tag;
            const src = (m[1] || m[2] || m[3] || "").trim();
            const proxied = proxyPdfImageSrc(src, settings.app_public_url, pdfEmbeddedImages) ?? src;
            return tag.replace(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i, `src="${proxied}"`);
        });
    };
    const renderSessionHtml = (htmlRaw: string, rowKey: string) => {
        const html = sanitizeCoverHtmlForPdf(rewriteImgSrcInHtml(htmlRaw));
        const blocks = splitCoverHtmlIntoPdfBlocks(html);
        const renderedImageKeys = new Set<string>();
        const nodes = blocks.map((b, i) => {
            if (b.type === 'img') {
                const src = proxyPdfImageSrc(b.src, settings.app_public_url, pdfEmbeddedImages) ?? b.src;
                if (b.src?.trim()) renderedImageKeys.add(b.src.trim());
                if (src?.trim()) renderedImageKeys.add(src.trim());
                return (
                    <View key={`${rowKey}-img-${i}`} style={styles.sessionImageFrame}>
                        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
                        <Image
                            src={src}
                            style={[
                                styles.sessionRichImageBase,
                                { width: Math.min(520, Math.max(110, b.widthPt ?? 520)) },
                                ...(Number.isFinite(b.heightPt)
                                    ? [{ height: Math.min(520, Math.max(80, Number(b.heightPt))) }]
                                    : []),
                            ]}
                        />
                    </View>
                );
            }
            const segs = splitCoverHtmlFragmentToSegments(b.content, { preserveEmptyParagraphs: true });
            return segs.map((seg, j) => {
                if (seg.kind === 'heading') {
                    return (
                        <Text
                            key={`${rowKey}-h-${i}-${j}`}
                            style={seg.textAlign ? [styles.sessionRichHeading, { textAlign: seg.textAlign }] : styles.sessionRichHeading}
                        >
                            {seg.text}
                        </Text>
                    );
                }
                if (seg.isEmpty) {
                    return <View key={`${rowKey}-sp-${i}-${j}`} style={styles.sessionRichParagraphSpacer} />;
                }
                return (
                    <Text
                        key={`${rowKey}-p-${i}-${j}`}
                        style={seg.textAlign ? [styles.sessionRichParagraph, { textAlign: seg.textAlign }] : styles.sessionRichParagraph}
                    >
                        {(seg.textAlign === 'center' || seg.textAlign === 'right')
                            ? seg.text
                            : `${ABNT_PARAGRAPH_INDENT}${seg.text}`}
                    </Text>
                );
            });
        });
        return { nodes, renderedImageKeys };
    };
    const rawValidity = Number(budget.validity_days ?? 15);
    const validityDays =
        Number.isFinite(rawValidity) && rawValidity >= 0 ? Math.min(Math.trunc(rawValidity), 3650) : 15;
    const formatMoney = (val: number) => {
        const n = Number(val);
        const safe = Number.isFinite(n) ? Math.min(Math.max(n, -1e15), 1e15) : 0;
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(safe);
    };
    const locations = budget.locations || [];
    const normalizeCostsMode = (raw: unknown): "location" | "section" | "general" => {
        const mode = String(raw ?? "section");
        if (mode === "location" || mode === "general") return mode;
        return "section";
    };
    const hasLocationOrSectionCostsEnabled = locations.some((loc) => {
        const locRow = loc as unknown as Record<string, unknown>;
        if (Boolean(locRow.show_costs_on_print)) return true;
        return (loc.sections || []).some((sec) =>
            Boolean((sec as unknown as Record<string, unknown>).show_costs_on_print)
        );
    });
    const detailShowCosts = Boolean(budget.show_costs_on_print) || hasLocationOrSectionCostsEnabled;
    const explicitModes = new Set<"location" | "section" | "general">();
    if (budget.show_costs_on_print) {
        explicitModes.add(normalizeCostsMode(budget.costs_display_mode));
    }
    for (const loc of locations) {
        const locRow = loc as unknown as Record<string, unknown>;
        if (Boolean(locRow.show_costs_on_print)) {
            explicitModes.add(normalizeCostsMode(locRow.costs_display_mode));
        }
        for (const sec of loc.sections || []) {
            const secRow = sec as unknown as Record<string, unknown>;
            if (Boolean(secRow.show_costs_on_print)) {
                explicitModes.add(normalizeCostsMode(secRow.costs_display_mode));
            }
        }
    }
    const detailCostsMode: "location" | "section" | "general" = explicitModes.has("general")
        ? "general"
        : explicitModes.has("location")
          ? "location"
          : "section";

    const hasCompositorStructure =
        !!compositorPdf && Array.isArray(compositorPdf.roots) && compositorPdf.roots.length > 0;
    const hasQuoteRoot = hasCompositorStructure
        ? compositorPdf!.roots.some((b) => b.type === "quote")
        : false;
    const compositorQuoteLocations =
        hasCompositorStructure && hasQuoteRoot
            ? collectCompositorQuoteLocations(compositorPdf!.roots, compositorPdf!.items || {})
            : [];
    const quoteLocationsForPdf = hasQuoteRoot
        ? (compositorQuoteLocations.length > 0 ? compositorQuoteLocations : collectScopeQuoteLocations(locations))
        : [];

    const coverBlock = compositorPdf
        ? flattenTree(compositorPdf.roots).find((b) => b.type === 'cover')
        : undefined;
    const scopeBlock = compositorPdf
        ? flattenTree(compositorPdf.roots).find((b) => b.type === "scope")
        : undefined;
    const headerFooterBlock = compositorPdf
        ? flattenTree(compositorPdf.roots).find((b) => b.type === "header_footer")
        : undefined;
    const compositorCoverMerged = mergeCoverDocumentProps(coverBlock?.props as Record<string, unknown> | undefined);
    const headerFooterProps = mergeHeaderFooterProps(
        headerFooterBlock?.props as Record<string, unknown> | undefined
    );

    const renderedFigureEntries = collectRenderedPdfFigureEntries(locations);
    const figureEntries =
        renderedFigureEntries.length > 0
            ? renderedFigureEntries
            : hasCompositorStructure && (compositorPdf!.scopeFigures?.length ?? 0) > 0
              ? compositorPdf!.scopeFigures
              : [];
    const includeFiguresPage = figureEntries.length > 0;

    const compositorImagesByBlock =
        ((compositorPdf?.imagesByBlock as Record<string, Array<{ url?: string; composed_url?: string }>>) || {});
    const compositorItemsByBlock = compositorPdf?.items || {};
    let segments: PdfSegment[] = hasCompositorStructure
        ? buildPdfSegmentsFromCompositorRoots(
              compositorPdf!.roots,
              includeFiguresPage,
              compositorItemsByBlock,
              compositorImagesByBlock
          )
        : defaultPdfSegmentsNoCompositor();

    if (hasCompositorStructure && !segments.some((s) => s.kind === "cover")) {
        segments = [{ kind: "cover" }, ...segments];
    }

    const { detailPage: fallbackDetailPage, sessionPages: fallbackSessionPages } =
        assignPdfSegmentPages(segments);
    const resolvedSegmentPages = resolvedPagination?.segmentStartPages ?? {};
    const detailPage = Number.isFinite(resolvedSegmentPages.detail)
        ? Math.max(1, Math.trunc(resolvedSegmentPages.detail))
        : fallbackDetailPage;
    const resolvedFigurePagesRaw = figureEntries.map((e) =>
        Number.isFinite(resolvedSegmentPages[`figure:${e.id}`])
            ? Math.max(1, Math.trunc(resolvedSegmentPages[`figure:${e.id}`]))
            : NaN
    );
    const resolvedFigureDistinctPages = new Set(
        resolvedFigurePagesRaw.filter((n) => Number.isFinite(n)).map((n) => Math.trunc(n))
    );
    const figurePageMarkersSuspicious =
        figureEntries.length >= 5 && resolvedFigureDistinctPages.size <= 1;
    const estimatedFigurePages = estimateRenderedFigurePagesFromScope(locations, detailPage, {
        showRunningHeader: pdfInnerRunningHeaderShouldShow(settings),
        showCosts: detailShowCosts,
        costsDisplayMode: detailCostsMode,
    });
    const sessionPages = new Map<string, number>(fallbackSessionPages);
    for (const [key, value] of Object.entries(resolvedSegmentPages)) {
        if (!key.startsWith("session:")) continue;
        if (!Number.isFinite(value) || value <= 0) continue;
        sessionPages.set(key.slice("session:".length), Math.trunc(value));
    }
    const detailSectionTitle = sanitizeTextForPdf(getScopeBlockLabel(scopeBlock?.label));
    const compositorSessionPageTitle = sanitizeTextForPdf(
        getCompositorPanelLabel(budget.compositor_label)
    );
    /**
     * Numeração do detalhamento no PDF:
     * - compositor: usa o número real do bloco `scope` (ex.: "2")
     * - legado: fallback para `budget.section_number`.
     */
    const rawScopeNumber = scopeBlock?.number ? String(scopeBlock.number).trim() : "";
    const legacySectionNumber = Number(budget.section_number ?? 1);
    const parsedScopeRootNumber = rawScopeNumber
        ? Number.parseInt(rawScopeNumber.split(".")[0] || rawScopeNumber, 10)
        : Number.NaN;
    const sectionNumberPdf =
        Number.isFinite(parsedScopeRootNumber) && parsedScopeRootNumber >= 0 && parsedScopeRootNumber <= 999
            ? Math.trunc(parsedScopeRootNumber)
            : Number.isFinite(legacySectionNumber) && legacySectionNumber >= 0 && legacySectionNumber <= 999
              ? Math.trunc(legacySectionNumber)
              : 1;
    const quoteShowSections = Boolean(
        (budget as unknown as Record<string, unknown>).quote_show_sections ?? false
    );
    const quotePercents = readQuoteSplitPercents(budget);

    const sessionTocRows = hasCompositorStructure
        ? collectSessionTocRowsForPrintedLayout(
              compositorPdf!.roots,
              sessionPages,
              compositorItemsByBlock,
              compositorImagesByBlock
          )
        : [];
    const adequacoesTocRows = estimateDetailTocRowsFromScope(locations, {
        sectionNumber: sectionNumberPdf,
        detailStartPage: detailPage,
        showRunningHeader: pdfInnerRunningHeaderShouldShow(settings),
        showCosts: detailShowCosts,
        costsDisplayMode: detailCostsMode,
        detailTitle: detailSectionTitle,
    });
    const tocRows = filterIntroTocEntries([...sessionTocRows, ...adequacoesTocRows]);

    const figureRows =
        hasCompositorStructure && includeFiguresPage
            ? figureEntries.map((entry, idx) => ({
                  n: idx + 1,
                  caption: entry.caption?.trim() || "(sem descrição)",
                  page: (() => {
                      const resolved = Number.isFinite(resolvedSegmentPages[`figure:${entry.id}`])
                          ? Math.max(1, Math.trunc(resolvedSegmentPages[`figure:${entry.id}`]))
                          : NaN;
                      const estimated = estimatedFigurePages[entry.id];
                      if (figurePageMarkersSuspicious && Number.isFinite(estimated)) return estimated;
                      if (Number.isFinite(resolved)) return resolved;
                      if (Number.isFinite(estimated)) return estimated;
                      return detailPage;
                  })(),
              }))
            : [];
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
        pdfEmbeddedImages
    );
    let effectiveInnerWatermarkOpacity =
        typeof innerWatermarkOpacity === "number" && Number.isFinite(innerWatermarkOpacity)
            ? innerWatermarkOpacity
            : legacyDocWatermarkOpacity;
    /**
     * Se `document_watermark_url` existir mas falhar no embed/proxy, a capa ainda pode mostrar só
     * `cover_watermark_url` — usa a mesma fonte da capa para o miolo.
     */
    if (!docWatermarkSrc) {
        const coverOnly = compositorCoverMerged.cover_watermark_url?.trim();
        if (coverOnly) {
            const fromCover = proxyPdfImageSrc(coverOnly, settings.app_public_url, pdfEmbeddedImages);
            if (fromCover) {
                docWatermarkSrc = fromCover;
                const o = compositorCoverMerged.cover_watermark_opacity;
                effectiveInnerWatermarkOpacity =
                    typeof o === "number" && Number.isFinite(o) ? o : 0.12;
            }
        }
    }

    const pdfCompanyName = sanitizeTextForPdf(settings.company_name);
    const pdfClosing = sanitizeTextForPdf(settings.closing_text);
    const innerHeaderText = htmlBandToPlainText(headerFooterProps.inner_header_html);
    const innerFooterText = htmlBandToPlainText(headerFooterProps.inner_footer_html);

    const renderPdfSegment = (seg: PdfSegment, i: number): React.ReactNode => {
        const keyBase = `pdf-${i}-${seg.kind}`;
        const innerCommon = {
            settings,
            budget,
            pdfEmbeddedImages,
            docWatermarkSrc,
            docWatermarkOpacity: effectiveInnerWatermarkOpacity,
            omitDocumentWatermark,
            paginationCollector,
            innerHeaderText,
            innerFooterText,
            showInnerHeaderBand: headerFooterProps.inner_show_header_band !== false,
            showInnerFooterBand: headerFooterProps.inner_show_footer_band !== false,
            innerHeaderHeight: headerFooterProps.inner_header_height,
            innerFooterHeight: headerFooterProps.inner_footer_height,
            innerWatermarkScalePct,
            innerWatermarkXPct,
            innerWatermarkYPct,
            innerWatermarkWidthPct,
            innerWatermarkAspect,
            headerFooterProps,
        };
        switch (seg.kind) {
            case "cover":
                return (
                    <CompositorCoverPdfPage
                        key={keyBase}
                        budget={budget}
                        settings={settings}
                        coverProps={compositorCoverMerged}
                        headerFooterProps={headerFooterProps}
                        pdfEmbeddedImages={pdfEmbeddedImages}
                    />
                );
            case "toc":
                return (
                    <InnerPdfPage pageKey={keyBase} title="Sumário" paginationProbeKey="toc" {...innerCommon}>
                        <Text style={{ fontSize: 9, color: theme.colors.textLight, marginBottom: 14 }}>
                            Páginas calculadas conforme a impressão atual do documento.
                        </Text>
                        {tocRows.length === 0 ? (
                            <Text style={{ fontSize: 10, fontStyle: "italic", color: theme.colors.textLight }}>
                                Nenhuma sessão numerada no documento. Inclua blocos do tipo &quot;Sessão&quot; no
                                Compositor para aparecerem aqui.
                            </Text>
                        ) : (
                            tocRows.map((row, idx) => (
                                <View
                                    key={`toc-${row.number}-${idx}`}
                                    style={[styles.tocRow, { paddingLeft: safeLayoutIndentDepth(row.depth, 6) * 10 }]}
                                >
                                    <Text style={styles.tocTitle}>
                                        {sanitizeTextForPdf(`${row.number} ${row.title}`.trim())}
                                    </Text>
                                    <View style={styles.tocDots} />
                                    <Text style={styles.tocPage}>
                                        {Number.isFinite(row.page) ? row.page : 1}
                                    </Text>
                                </View>
                            ))
                        )}
                    </InnerPdfPage>
                );
            case "figures":
                return (
                    <InnerPdfPage pageKey={keyBase} title="Lista de Figuras" paginationProbeKey="figures" {...innerCommon}>
                        <Text style={{ fontSize: 9, color: theme.colors.textLight, marginBottom: 14 }}>
                            Figuras de Adequações. A página indicada referencia o início do detalhamento impresso.
                        </Text>
                        {figureRows.map((row) => (
                            <View key={`fig-${row.n}`} style={styles.tocRow}>
                                <Text style={styles.tocTitle}>
                                    {sanitizeTextForPdf(`Figura ${row.n} — ${row.caption}`)}
                                </Text>
                                <View style={styles.tocDots} />
                                <Text style={styles.tocPage}>
                                    {Number.isFinite(row.page) ? row.page : 1}
                                </Text>
                            </View>
                        ))}
                    </InnerPdfPage>
                );
            case "quote":
                return (
                    <InnerPdfPage pageKey={keyBase} title="Orçamento" paginationProbeKey="quote" {...innerCommon}>
                        {quoteLocationsForPdf.length > 0 ? (
                            <View style={styles.quoteCard}>
                                <View style={styles.quoteHeaderBar}>
                                    <Text style={styles.quoteHeaderTitle}>
                                        Custos de equipamentos — Pazini
                                    </Text>
                                </View>
                                <View style={styles.quoteTableHeader}>
                                    <Text style={[styles.quoteHeaderCell, { width: 32 }]}>Nº</Text>
                                    <Text style={[styles.quoteHeaderCell, { flex: 1 }]}>Local / trecho</Text>
                                    <Text style={[styles.quoteHeaderCell, { width: 72, textAlign: 'right' }]}>
                                        Equipamentos
                                    </Text>
                                    <Text style={[styles.quoteHeaderCell, { width: 72, textAlign: 'right' }]}>
                                        Montagem
                                    </Text>
                                </View>
                                {quoteLocationsForPdf.map((loc, locIdx) => {
                                    const locationBase = loc.sections.reduce(
                                        (sum, sec) => {
                                            const calc = computeSectionEquipAssembly(sec.items);
                                            return {
                                                equipment: sum.equipment + calc.equipment,
                                                assembly: sum.assembly + calc.assembly,
                                            };
                                        },
                                        { equipment: 0, assembly: 0 }
                                    );
                                    const locationAdjusted = applyQuoteRowAdjustments(
                                        locationBase.equipment,
                                        locationBase.assembly,
                                        quotePercents.markupEquip,
                                        quotePercents.discountEquip,
                                        quotePercents.markupAsm,
                                        quotePercents.discountAsm
                                    );
                                    return (
                                        <View key={`q-loc-${loc.id}`}>
                                            <View style={[styles.quoteRow, styles.quoteLocRow]}>
                                                <Text style={[styles.quoteColIndex, { fontFamily: theme.fonts.bold }]}>
                                                    {sanitizeTextForPdf(String(locIdx + 1))}
                                                </Text>
                                                <View style={styles.quoteColDescWrap}>
                                                    <Text style={styles.quoteColDescLoc}>
                                                        {sanitizeTextForPdf(loc.title)}
                                                    </Text>
                                                </View>
                                                <Text style={styles.quoteColMoneyBold}>
                                                    {formatMoney(locationAdjusted.equipment)}
                                                </Text>
                                                <Text style={styles.quoteColMoneyBold}>
                                                    {formatMoney(locationAdjusted.assembly)}
                                                </Text>
                                            </View>
                                            {quoteShowSections && loc.sections.map((sec) => {
                                                const sectionBase = computeSectionEquipAssembly(sec.items);
                                                const sectionAdjusted = applyQuoteRowAdjustments(
                                                    sectionBase.equipment,
                                                    sectionBase.assembly,
                                                    quotePercents.markupEquip,
                                                    quotePercents.discountEquip,
                                                    quotePercents.markupAsm,
                                                    quotePercents.discountAsm
                                                );
                                                return (
                                                    <View key={`q-sec-${loc.id}-${sec.id}`}>
                                                        <View style={[styles.quoteRow, styles.quoteSecRow]}>
                                                            <Text style={[styles.quoteColIndex, { color: theme.colors.textLight }]}>
                                                                —
                                                            </Text>
                                                            <View style={styles.quoteColDescWrap}>
                                                                <Text style={styles.quoteColDescSec}>
                                                                    {sanitizeTextForPdf(sec.title)}
                                                                </Text>
                                                            </View>
                                                            <Text style={styles.quoteColMoney}>
                                                                {formatMoney(sectionAdjusted.equipment)}
                                                            </Text>
                                                            <Text style={styles.quoteColMoney}>
                                                                {formatMoney(sectionAdjusted.assembly)}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    );
                                })}
                                {(() => {
                                    const totals = quoteLocationsForPdf.reduce(
                                        (sum, loc) => {
                                            const locBase = loc.sections.reduce(
                                                (inner, sec) => {
                                                    const calc = computeSectionEquipAssembly(sec.items);
                                                    return {
                                                        equipment: inner.equipment + calc.equipment,
                                                        assembly: inner.assembly + calc.assembly,
                                                    };
                                                },
                                                { equipment: 0, assembly: 0 }
                                            );
                                            const adj = applyQuoteRowAdjustments(
                                                locBase.equipment,
                                                locBase.assembly,
                                                quotePercents.markupEquip,
                                                quotePercents.discountEquip,
                                                quotePercents.markupAsm,
                                                quotePercents.discountAsm
                                            );
                                            return {
                                                equipment: sum.equipment + adj.equipment,
                                                assembly: sum.assembly + adj.assembly,
                                            };
                                        },
                                        { equipment: 0, assembly: 0 }
                                    );
                                    return (
                                        <>
                                            <View style={styles.quoteTotalRow}>
                                                <Text style={{ width: 32 }} />
                                                <Text style={styles.quoteTotalLabel}>Totais</Text>
                                                <Text style={styles.quoteTotalValue}>
                                                    {formatMoney(totals.equipment)}
                                                </Text>
                                                <Text style={styles.quoteTotalValue}>
                                                    {formatMoney(totals.assembly)}
                                                </Text>
                                            </View>
                                            <View style={styles.quoteFooterLabelsRow}>
                                                <Text style={{ width: 32 }} />
                                                <View style={{ flex: 1 }} />
                                                <Text style={styles.quoteFooterLabel}>Equipamentos</Text>
                                                <Text style={styles.quoteFooterLabel}>Montagem</Text>
                                            </View>
                                        </>
                                    );
                                })()}
                            </View>
                        ) : (
                            <Text style={{ fontSize: 9, color: theme.colors.textLight }}>
                                Sem dados de orçamento para exibir.
                            </Text>
                        )}
                    </InnerPdfPage>
                );
            case "detail":
                return (
                    <InnerPdfPage pageKey={keyBase} title={detailSectionTitle} paginationProbeKey="detail" {...innerCommon}>
                        <BudgetTable
                            locations={locations}
                            sectionNumber={sectionNumberPdf}
                            showCosts={detailShowCosts}
                            costsDisplayMode={detailCostsMode}
                            pdfImagePublicBase={settings.app_public_url}
                            pdfEmbeddedImages={pdfEmbeddedImages}
                            figurePageCollector={paginationCollector}
                        />
                    </InnerPdfPage>
                );
            case "session": {
                const sessionRoot = seg.block;
                const rows = collectSessionPrintRows(
                    sessionRoot,
                    compositorPdf?.items || {},
                    (compositorPdf?.imagesByBlock as Record<string, Array<{ url?: string; composed_url?: string }>>) || {}
                );
                return (
                    <InnerPdfPage
                        pageKey={`session-page-${sessionRoot.id}`}
                        title={compositorSessionPageTitle}
                        paginationProbeKey={`session:${sessionRoot.id}`}
                        {...innerCommon}
                    >
                        <Text style={styles.sessionTitle}>
                            {sanitizeTextForPdf(
                                `${sessionRoot.number ? `${sessionRoot.number} ` : ""}${(sessionRoot.label || "Sessão").trim()}`
                            )}
                        </Text>
                        {rows.length === 0 ? (
                            <Text style={styles.sessionRowText}>Sem conteúdo textual nesta sessão.</Text>
                        ) : (
                            rows.map((row, idx) => (
                                <View
                                    key={`session-row-${sessionRoot.id}-${idx}`}
                                    style={[styles.sessionRow, { marginLeft: safeLayoutIndentDepth(row.depth, 5) * 10 }]}
                                >
                                    <Text style={styles.sessionRowTitle}>{sanitizeTextForPdf(row.title)}</Text>
                                    {(() => {
                                        const rendered = row.html?.trim()
                                            ? renderSessionHtml(row.html, `session-${sessionRoot.id}-${idx}`)
                                            : { nodes: null, renderedImageKeys: new Set<string>() };
                                        const fallbackUrls = Array.from(
                                            new Set([
                                                ...extractImageUrlsFromHtml(row.html || ""),
                                                ...(row.blockImageUrls || []),
                                            ])
                                        );
                                        const fallbackMissing = fallbackUrls.filter((raw) => {
                                            const proxied =
                                                proxyPdfImageSrc(raw, settings.app_public_url, pdfEmbeddedImages) ?? raw;
                                            return (
                                                !rendered.renderedImageKeys.has(raw.trim()) &&
                                                !rendered.renderedImageKeys.has(proxied.trim())
                                            );
                                        });
                                        return (
                                            <>
                                                {rendered.nodes}
                                                {fallbackMissing.length
                                                    ? fallbackMissing.map((raw, imgIdx) => {
                                                          const src =
                                                              proxyPdfImageSrc(raw, settings.app_public_url, pdfEmbeddedImages) ??
                                                              raw;
                                                          return (
                                                              <View
                                                                  key={`session-gallery-${sessionRoot.id}-${idx}-${imgIdx}`}
                                                                  style={styles.sessionImageFrame}
                                                              >
                                                                  {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
                                                                  <Image
                                                                      src={src}
                                                                      style={[
                                                                          styles.sessionGalleryImageBase,
                                                                          { width: 520 },
                                                                      ]}
                                                                  />
                                                              </View>
                                                          );
                                                      })
                                                    : null}
                                            </>
                                        );
                                    })()}
                                    {row.extraText ? (
                                        <Text style={styles.sessionRowText}>{sanitizeTextForPdf(row.extraText)}</Text>
                                    ) : null}
                                </View>
                            ))
                        )}
                    </InnerPdfPage>
                );
            }
            case "terms":
                return (
                    <InnerPdfPage
                        pageKey={keyBase}
                        title="Condições Gerais"
                        pageStyleExtra={{ flexDirection: "column" }}
                        paginationProbeKey="terms"
                        {...innerCommon}
                    >
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pdf Style doesn't type whiteSpace */}
                        <Text style={{ fontSize: 10, whiteSpace: "pre-wrap", marginBottom: 12 } as any}>
                            {pdfClosing}
                        </Text>
                        <View style={{ height: 100 }} />
                        <View
                            style={{
                                flexDirection: "row",
                                marginBottom: 50,
                                justifyContent: "space-between",
                            }}
                        >
                            <View
                                style={{
                                    borderTopWidth: 1,
                                    flex: 1,
                                    alignItems: "center",
                                    paddingTop: 10,
                                    marginRight: 20,
                                }}
                            >
                                <Text style={{ fontSize: 11, fontFamily: theme.fonts.bold }}>{pdfCompanyName}</Text>
                                <Text style={{ fontSize: 9 }}>Diretoria Comercial</Text>
                            </View>
                            <View
                                style={{
                                    borderTopWidth: 1,
                                    flex: 1,
                                    alignItems: "center",
                                    paddingTop: 10,
                                    marginLeft: 20,
                                }}
                            >
                                <Text style={{ fontSize: 11, fontFamily: theme.fonts.bold }}>De Acordo</Text>
                                <Text style={{ fontSize: 9 }}>Cliente</Text>
                            </View>
                        </View>
                    </InnerPdfPage>
                );
            default:
                return null;
        }
    };

    return <Document>{segments.map((seg, i) => renderPdfSegment(seg, i))}</Document>;
};

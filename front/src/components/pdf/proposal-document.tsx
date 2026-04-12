
import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { Budget } from '@/types/budget-types';
import { ProposalSettings } from '@/actions/settings-actions';
import { theme } from './theme';
import { BudgetTable } from './sections/budget-table';
import { CompositorCoverPdfPage } from './sections/compositor-cover-pdf';
import type { CompositorPdfPayload } from './compositor-pdf-types';
import { type BudgetBlock, flattenTree } from '@/types/budget-compositor-types';
import { mergeCoverDocumentProps, resolveInnerPagesWatermark } from '@/lib/budgets/cover-document';
import { type PdfEmbeddedImages, proxyPdfImageSrc } from '@/lib/pdf/pdf-image-src';
import { stripHtmlToText } from '@/lib/pdf/html-to-plain-text';
import { sanitizeTextForPdf } from '@/lib/pdf/sanitize-pdf-text';
import { pdfInnerRunningHeaderShouldShow } from '@/lib/pdf/pdf-proposal-header';
import { PdfProposalHeaderBand } from '@/components/pdf/pdf-proposal-header-band';
import type { BudgetItem } from '@/types/budget-types';
import type { BudgetLocation } from '@/types/budget-types';
import { applyQuoteRowAdjustments } from '@/lib/budgets/scope-pricing';

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
    totalBlock: {
        marginTop: 30,
        backgroundColor: theme.colors.bgHeader,
        padding: 15,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
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
    quoteHeaderBar: {
        borderBottomWidth: 1,
        borderBottomColor: '#d1d5db',
        backgroundColor: '#f3f4f6',
        paddingVertical: 6,
        paddingHorizontal: 10,
        marginBottom: 6,
    },
    quoteHeaderTitle: {
        fontSize: 10,
        fontFamily: theme.fonts.bold,
        color: theme.colors.text,
        textTransform: 'uppercase',
        textAlign: 'center',
    },
    quoteTableHeader: {
        flexDirection: "row",
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.bgHeader,
        paddingVertical: 5,
    },
    quoteRow: {
        flexDirection: "row",
        borderBottomWidth: 0.5,
        borderBottomColor: theme.colors.border,
        paddingVertical: 4,
    },
    quoteColIndex: { flex: 3, fontSize: 9 },
    quoteColDesc: { flex: 14, fontSize: 9 },
    quoteColEquip: { flex: 6, textAlign: "right", fontSize: 9 },
    quoteColAsm: { flex: 6, textAlign: "right", fontSize: 9 },
    quoteLocRow: {
        backgroundColor: '#f7fafc',
    },
    quoteSecRow: {
        backgroundColor: '#ffffff',
    },
    quoteTotalRow: {
        flexDirection: "row",
        borderTopWidth: 1,
        borderTopColor: '#f59e0b',
        backgroundColor: '#fef3c7',
        paddingVertical: 6,
        marginTop: 4,
    },
    quoteTotalLabel: {
        flex: 17,
        fontSize: 9,
        fontFamily: theme.fonts.bold,
        textTransform: 'uppercase',
        textAlign: 'right',
    },
    quoteTotalValue: {
        flex: 6,
        fontSize: 9,
        fontFamily: theme.fonts.bold,
        textAlign: 'right',
    },
    quoteGrandRow: {
        flexDirection: "row",
        borderTopWidth: 1,
        borderTopColor: '#f59e0b',
        backgroundColor: '#fffbeb',
        paddingVertical: 4,
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
    itemsByBlock: Record<string, BudgetItem[]>
): Array<{ depth: number; title: string; text: string }> {
    const rows: Array<{ depth: number; title: string; text: string }> = [];
    const visit = (node: BudgetBlock, depth: number) => {
        if (node.type === 'session') {
            const desc = stripHtmlToText((node.props?.description as string) || '');
            rows.push({
                depth,
                title: `${node.number ? `${node.number} ` : ''}${(node.label || 'Sessão').trim()}`,
                text: desc,
            });
        } else if (node.type === 'text') {
            const txt = stripHtmlToText((node.props?.content as string) || '');
            rows.push({
                depth,
                title: 'Texto',
                text: txt,
            });
        } else if (node.type === 'location') {
            const desc = stripHtmlToText((node.props?.description as string) || '');
            rows.push({
                depth,
                title: `Local: ${(node.label || 'Local').trim()}`,
                text: desc,
            });
        } else if (node.type === 'section') {
            const desc = stripHtmlToText((node.props?.description as string) || '');
            const count = itemsByBlock[node.id]?.length ?? 0;
            rows.push({
                depth,
                title: `Trecho: ${(node.label || 'Trecho').trim()}`,
                text: [desc, count > 0 ? `${count} item(ns) vinculados.` : '']
                    .filter(Boolean)
                    .join('\n'),
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

    const ensureSpace = (h: number) => {
        if (y > 0 && y + h > pageContentMax) {
            page += 1;
            y = 0;
        }
    };
    const addHeight = (h: number) => {
        ensureSpace(h);
        y += h;
    };

    for (const loc of locations ?? []) {
        addHeight(38); // locationHeader aprox.
        for (const sec of loc.sections ?? []) {
            addHeight(22); // sectionTitle aprox.
            const firstImg = (sec.images ?? [])[0];
            if (firstImg?.id) {
                const imgBlockH = 262; // sceneImage(250) + margem + respiro
                ensureSpace(imgBlockH);
                out[String(firstImg.id)] = page;
                y += imgBlockH;
            }
            const rows = (sec.items ?? []).length;
            const tableH = 16 + rows * 17 + (opts.showCosts && opts.costsDisplayMode === "section" ? 14 : 0);
            addHeight(Math.max(24, tableH));
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

type PdfSegment =
    | { kind: "cover" }
    | { kind: "intro" }
    | { kind: "toc" }
    | { kind: "figures" }
    | { kind: "quote" }
    | { kind: "detail" }
    | { kind: "session"; block: BudgetBlock }
    | { kind: "terms" };

function buildPdfSegmentsFromCompositorRoots(
    roots: BudgetBlock[],
    includeFiguresPage: boolean
): PdfSegment[] {
    const segments: PdfSegment[] = [];
    let placedIntro = false;
    let placedQuote = false;
    let placedDetail = false;
    for (const b of roots) {
        if (b.type === "cover") {
            segments.push({ kind: "cover" });
            if (!placedIntro) {
                segments.push({ kind: "intro" });
                placedIntro = true;
            }
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
        } else if (b.type === "session") {
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
    return [{ kind: "cover" }, { kind: "intro" }, { kind: "quote" }, { kind: "detail" }, { kind: "terms" }];
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
        if (seg.kind === "cover" || seg.kind === "intro" || seg.kind === "toc" || seg.kind === "figures") {
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
    sessionPages: Map<string, number>
): Array<{ number: string; title: string; depth: number; page: number }> {
    const out: Array<{ number: string; title: string; depth: number; page: number }> = [];
    const sessionRoots = roots.filter((b) => b.type === "session");

    const collectSessionsDfs = (node: BudgetBlock, page: number) => {
        if (node.type === "session") {
            out.push({
                number: node.number || "",
                title: (node.label || "Sessão").trim() || "Sessão",
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
}) {
    const fill = settings.pdf_header_fill_from_settings === true;
    const company = fill
        ? sanitizeTextForPdf(settings.company_name?.trim() || "")
        : "";
    const logoUrl = fill ? settings.company_logo_url?.trim() : undefined;
    const logoSrc = logoUrl
        ? proxyPdfImageSrc(logoUrl, settings.app_public_url, pdfEmbeddedImages)
        : undefined;
    const showRunningHeader = pdfInnerRunningHeaderShouldShow(settings);
    const code = sanitizeTextForPdf((budget.code || "").trim() || "—");

    const wmTop = showRunningHeader ? INNER_PAD + INNER_HEADER_RESERVE : INNER_PAD;
    const wmHeight = Math.max(40, INNER_PAGE_H - wmTop - (INNER_PAD + INNER_FOOTER_RESERVE));
    const wmOpacity = Math.min(0.22, Math.max(docWatermarkOpacity, 0.08));

    return (
        <Page
            key={pageKey}
            size="A4"
            style={[
                styles.innerPageRoot,
                styles.pageWithWatermark,
                {
                    paddingTop: INNER_PAD + (showRunningHeader ? INNER_HEADER_RESERVE : 0),
                    paddingBottom: INNER_PAD + INNER_FOOTER_RESERVE,
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
                        style={[styles.documentWatermarkImage, { opacity: wmOpacity }]}
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
            {showRunningHeader ? (
                <View style={styles.runningHeaderBand} fixed>
                    <PdfProposalHeaderBand settings={settings} logoSrc={logoSrc} companyName={company} />
                </View>
            ) : null}
            <View style={styles.runningFooterBand} fixed>
                <Text style={styles.runningFooterMuted}>Cód. {code}</Text>
                <Text
                    style={styles.runningFooterPage}
                    render={({ pageNumber, totalPages }) => {
                        if (paginationCollector && paginationProbeKey) {
                            const prev = paginationCollector.segmentStartPages[paginationProbeKey];
                            if (!Number.isFinite(prev) || pageNumber < prev) {
                                paginationCollector.segmentStartPages[paginationProbeKey] = pageNumber;
                            }
                        }
                        return `${pageNumber} / ${totalPages}`;
                    }}
                />
            </View>
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
    const rawValidity = Number(budget.validity_days ?? 15);
    const validityDays =
        Number.isFinite(rawValidity) && rawValidity >= 0 ? Math.min(Math.trunc(rawValidity), 3650) : 15;
    const rawSectionNumber = Number(budget.section_number ?? 1);
    const sectionNumberPdf =
        Number.isFinite(rawSectionNumber) && rawSectionNumber >= 0 && rawSectionNumber <= 999
            ? Math.trunc(rawSectionNumber)
            : 1;
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
    const compositorCoverMerged = mergeCoverDocumentProps(coverBlock?.props as Record<string, unknown> | undefined);

    const renderedFigureEntries = collectRenderedPdfFigureEntries(locations);
    const figureEntries =
        renderedFigureEntries.length > 0
            ? renderedFigureEntries
            : hasCompositorStructure && (compositorPdf!.scopeFigures?.length ?? 0) > 0
              ? compositorPdf!.scopeFigures
              : [];
    const includeFiguresPage = figureEntries.length > 0;

    let segments: PdfSegment[] = hasCompositorStructure
        ? buildPdfSegmentsFromCompositorRoots(compositorPdf!.roots, includeFiguresPage)
        : defaultPdfSegmentsNoCompositor();

    if (hasCompositorStructure && !segments.some((s) => s.kind === "cover")) {
        segments = [{ kind: "cover" }, { kind: "intro" }, ...segments];
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
    const detailSectionTitle = "Detalhamento do Projeto";
    const quoteShowSections = Boolean(
        (budget as unknown as Record<string, unknown>).quote_show_sections ?? false
    );
    const quotePercents = readQuoteSplitPercents(budget);

    const tocRows = hasCompositorStructure
        ? collectSessionTocRowsForPrintedLayout(compositorPdf!.roots, sessionPages)
        : [];

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
    const { url: docWatermarkSource, opacity: docWatermarkOpacity } =
        resolveInnerPagesWatermark(compositorCoverMerged);
    let docWatermarkSrc = proxyPdfImageSrc(docWatermarkSource, settings.app_public_url, pdfEmbeddedImages);
    let effectiveInnerWatermarkOpacity = docWatermarkOpacity;
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
    const pdfIntroduction = sanitizeTextForPdf(settings.introduction_text);
    const pdfClosing = sanitizeTextForPdf(settings.closing_text);

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
        };
        switch (seg.kind) {
            case "cover":
                return (
                    <CompositorCoverPdfPage
                        key={keyBase}
                        budget={budget}
                        settings={settings}
                        coverProps={compositorCoverMerged}
                        pdfEmbeddedImages={pdfEmbeddedImages}
                    />
                );
            case "intro":
                return (
                    <InnerPdfPage pageKey={keyBase} title="Apresentação" paginationProbeKey="intro" {...innerCommon}>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pdf Style não tipa whiteSpace */}
                        <Text style={{ whiteSpace: "pre-wrap", textAlign: "left" } as any}>
                            {pdfIntroduction}
                        </Text>
                    </InnerPdfPage>
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
                            Figuras do Escopo. A página indicada referencia o início do detalhamento impresso.
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
                            <View>
                                <View style={styles.quoteHeaderBar}>
                                    <Text style={styles.quoteHeaderTitle}>Custos de equipamentos - Pazini</Text>
                                </View>
                                <View style={styles.quoteTableHeader}>
                                    <Text style={styles.quoteColIndex}>Nº</Text>
                                    <Text style={styles.quoteColDesc}>Local / trecho</Text>
                                    <Text style={styles.quoteColEquip}>Equipamentos</Text>
                                    <Text style={styles.quoteColAsm}>Montagem</Text>
                                </View>
                                {quoteLocationsForPdf.map((loc, locIdx) => {
                                    const locNumber = `${sectionNumberPdf}.${locIdx + 1}`;
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
                                                <Text style={[styles.quoteColDesc, { fontFamily: theme.fonts.bold }]}>
                                                    {sanitizeTextForPdf(loc.title)}
                                                </Text>
                                                <Text style={[styles.quoteColEquip, { fontFamily: theme.fonts.bold }]}>
                                                    {formatMoney(locationAdjusted.equipment)}
                                                </Text>
                                                <Text style={[styles.quoteColAsm, { fontFamily: theme.fonts.bold }]}>
                                                    {formatMoney(locationAdjusted.assembly)}
                                                </Text>
                                            </View>
                                            {quoteShowSections && loc.sections.map((sec, secIdx) => {
                                                const secNumber = `${locNumber}.${secIdx + 1}`;
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
                                                            <Text style={styles.quoteColIndex}>—</Text>
                                                            <Text style={[styles.quoteColDesc, { color: theme.colors.textLight }]}>
                                                                {sanitizeTextForPdf(`${secNumber} — ${sec.title}`)}
                                                            </Text>
                                                            <Text style={styles.quoteColEquip}>
                                                                {formatMoney(sectionAdjusted.equipment)}
                                                            </Text>
                                                            <Text style={styles.quoteColAsm}>
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
                                                <Text style={styles.quoteTotalLabel}>Totais</Text>
                                                <Text style={styles.quoteTotalValue}>
                                                    {formatMoney(totals.equipment)}
                                                </Text>
                                                <Text style={styles.quoteTotalValue}>
                                                    {formatMoney(totals.assembly)}
                                                </Text>
                                            </View>
                                            <View style={styles.quoteGrandRow}>
                                                <Text style={styles.quoteTotalLabel}>Total geral</Text>
                                                <Text style={styles.quoteTotalValue}>
                                                    {formatMoney(totals.equipment + totals.assembly)}
                                                </Text>
                                                <Text style={styles.quoteTotalValue}>—</Text>
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
                        <View style={styles.totalBlock}>
                            <View>
                                <Text style={{ fontSize: 12, fontFamily: theme.fonts.bold }}>INVESTIMENTO TOTAL</Text>
                                <Text style={{ fontSize: 10 }}>Validade: {validityDays} dias</Text>
                            </View>
                            <Text style={{ fontFamily: theme.fonts.bold, fontSize: 18, color: theme.colors.primary }}>
                                {formatMoney(budget.total_value || 0)}
                            </Text>
                        </View>
                    </InnerPdfPage>
                );
            case "session": {
                const sessionRoot = seg.block;
                const rows = collectSessionPrintRows(sessionRoot, compositorPdf?.items || {});
                return (
                    <InnerPdfPage
                        pageKey={`session-page-${sessionRoot.id}`}
                        title="Sessão do Compositor"
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
                                    {row.text ? (
                                        <Text style={styles.sessionRowText}>{sanitizeTextForPdf(row.text)}</Text>
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

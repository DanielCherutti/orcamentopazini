
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
    type CoverBlockProps,
} from '@/types/budget-compositor-types';
import { mergeCoverDocumentProps } from '@/lib/budgets/cover-document';
import { type PdfEmbeddedImages, proxyPdfImageSrc } from '@/lib/pdf/pdf-image-src';
import { stripHtmlToText } from '@/lib/pdf/html-to-plain-text';
import { sanitizeTextForPdf } from '@/lib/pdf/sanitize-pdf-text';
import { pdfInnerRunningHeaderShouldShow } from '@/lib/pdf/pdf-proposal-header';
import { PdfProposalHeaderBand } from '@/components/pdf/pdf-proposal-header-band';
import type { BudgetItem } from '@/types/budget-types';

interface ProposalDocumentProps {
    budget: Budget;
    settings: ProposalSettings;
    /** Quando presente, sumário/lista de figuras seguem o compositor; detalhamento continua pelo Escopo (`locations`). */
    compositorPdf?: CompositorPdfPayload;
    /** Evita marca d’água nas páginas internas (útil se imagem remota corromper o layout). */
    omitDocumentWatermark?: boolean;
    /** Data URIs pré-carregadas na rota API (evita `fetch` HTTP durante `renderToBuffer`). */
    pdfEmbeddedImages?: PdfEmbeddedImages;
}

const styles = StyleSheet.create({
    pageWithWatermark: {
        position: 'relative',
    },
    /** Altura/top são definidos por página (marca d’água entre cabeçalho e rodapé). */
    documentWatermarkLayer: {
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    /** Dimensões fixas em pt; `contain` encaixa a arte sem esticar (evita caixa vazia no viewer). */
    documentWatermarkImage: {
        width: Math.round(595.28 * 0.82),
        height: Math.round(841.89 * 0.82),
        objectFit: 'contain',
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
        top: 35,
        left: 35,
        right: 35,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
        zIndex: 2,
    },
    runningFooterBand: {
        position: 'absolute',
        bottom: 35,
        left: 35,
        right: 35,
        paddingTop: 6,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 2,
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
});

function clampDocumentOpacity(value: number | undefined, fallback: number): number {
    const n = typeof value === "number" ? value : fallback;
    if (!Number.isFinite(n)) return fallback;
    if (n < 0) return 0;
    // Marca d'água das páginas internas precisa ser mais discreta que a capa.
    if (n > 0.12) return 0.12;
    return n;
}

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

type PdfSegment =
    | { kind: "cover" }
    | { kind: "intro" }
    | { kind: "toc" }
    | { kind: "figures" }
    | { kind: "detail" }
    | { kind: "session"; block: BudgetBlock }
    | { kind: "terms" };

function buildPdfSegmentsFromCompositorRoots(
    roots: BudgetBlock[],
    includeFiguresPage: boolean
): PdfSegment[] {
    const segments: PdfSegment[] = [];
    let placedIntro = false;
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
        } else if (b.type === "scope") {
            segments.push({ kind: "detail" });
        } else if (b.type === "session") {
            segments.push({ kind: "session", block: b });
        }
    }
    if (!segments.some((s) => s.kind === "detail")) {
        segments.push({ kind: "detail" });
    }
    segments.push({ kind: "terms" });
    return segments;
}

function defaultPdfSegmentsNoCompositor(): PdfSegment[] {
    return [{ kind: "cover" }, { kind: "intro" }, { kind: "detail" }, { kind: "terms" }];
}

function assignPdfSegmentPages(segments: PdfSegment[]): {
    detailPage: number;
    sessionPages: Map<string, number>;
} {
    let p = 1;
    let detailPage = 1;
    const sessionPages = new Map<string, number>();
    for (const seg of segments) {
        if (seg.kind === "cover" || seg.kind === "intro" || seg.kind === "toc" || seg.kind === "figures") {
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
    return { detailPage, sessionPages };
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

const INNER_PAD = 35;
const INNER_HEADER_RESERVE = 88;
const INNER_FOOTER_RESERVE = 30;
const INNER_PAGE_H = 841.89;

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

    return (
        <Page
            key={pageKey}
            size="A4"
            style={[
                styles.contentPage,
                styles.pageWithWatermark,
                {
                    paddingTop: INNER_PAD + (showRunningHeader ? INNER_HEADER_RESERVE : 0),
                    paddingBottom: INNER_PAD + INNER_FOOTER_RESERVE,
                },
                ...(pageStyleExtra ? [pageStyleExtra] : []),
            ]}
        >
            {!omitDocumentWatermark && docWatermarkSrc ? (
                <View style={[styles.documentWatermarkLayer, { top: wmTop, height: wmHeight }]} fixed>
                    {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
                    <Image
                        src={docWatermarkSrc}
                        style={[styles.documentWatermarkImage, { opacity: docWatermarkOpacity }]}
                    />
                </View>
            ) : null}
            {showRunningHeader ? (
                <View style={styles.runningHeaderBand} fixed>
                    <PdfProposalHeaderBand settings={settings} logoSrc={logoSrc} companyName={company} />
                </View>
            ) : null}
            <View style={styles.runningFooterBand} fixed>
                <Text style={styles.runningFooterMuted}>Cód. {code}</Text>
                <Text
                    style={styles.runningFooterPage}
                    render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
                />
            </View>
            <View style={styles.segmentHeader}>
                <Text style={styles.headerTitle}>{title}</Text>
            </View>
            {children}
        </Page>
    );
}

export const ProposalDocument = ({
    budget,
    settings,
    compositorPdf,
    omitDocumentWatermark = false,
    pdfEmbeddedImages,
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

    const coverBlock = compositorPdf
        ? flattenTree(compositorPdf.roots).find((b) => b.type === 'cover')
        : undefined;
    const compositorCoverMerged = mergeCoverDocumentProps(coverBlock?.props as Record<string, unknown> | undefined);

    const figureEntries =
        hasCompositorStructure && (compositorPdf!.scopeFigures?.length ?? 0) > 0
            ? compositorPdf!.scopeFigures
            : [];
    const includeFiguresPage = figureEntries.length > 0;

    let segments: PdfSegment[] = hasCompositorStructure
        ? buildPdfSegmentsFromCompositorRoots(compositorPdf!.roots, includeFiguresPage)
        : defaultPdfSegmentsNoCompositor();

    if (hasCompositorStructure && !segments.some((s) => s.kind === "cover")) {
        segments = [{ kind: "cover" }, { kind: "intro" }, ...segments];
    }

    const { detailPage, sessionPages } = assignPdfSegmentPages(segments);

    const tocRows = hasCompositorStructure
        ? collectSessionTocRowsForPrintedLayout(compositorPdf!.roots, sessionPages)
        : [];

    const figureRows =
        hasCompositorStructure && includeFiguresPage
            ? figureEntries.map((entry, idx) => ({
                  n: idx + 1,
                  caption: entry.caption?.trim() || "(sem descrição)",
                  page: detailPage,
              }))
            : [];
    const docWatermarkSource =
        compositorCoverMerged.document_watermark_url?.trim()
            ? compositorCoverMerged.document_watermark_url
            : compositorCoverMerged.cover_watermark_url;
    const docWatermarkSrc = proxyPdfImageSrc(docWatermarkSource, settings.app_public_url, pdfEmbeddedImages);
    const docWatermarkOpacity = clampDocumentOpacity(compositorCoverMerged.document_watermark_opacity, 0.06);

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
            docWatermarkOpacity,
            omitDocumentWatermark,
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
                    <InnerPdfPage pageKey={keyBase} title="Apresentação" {...innerCommon}>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pdf Style não tipa whiteSpace */}
                        <Text style={{ whiteSpace: "pre-wrap", textAlign: "left" } as any}>
                            {pdfIntroduction}
                        </Text>
                    </InnerPdfPage>
                );
            case "toc":
                return (
                    <InnerPdfPage pageKey={keyBase} title="Sumário" {...innerCommon}>
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
                    <InnerPdfPage pageKey={keyBase} title="Lista de Figuras" {...innerCommon}>
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
            case "detail":
                return (
                    <InnerPdfPage pageKey={keyBase} title="Detalhamento do Projeto" {...innerCommon}>
                        <BudgetTable
                            locations={locations}
                            sectionNumber={sectionNumberPdf}
                            showCosts={detailShowCosts}
                            costsDisplayMode={detailCostsMode}
                            pdfImagePublicBase={settings.app_public_url}
                            pdfEmbeddedImages={pdfEmbeddedImages}
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
                    <InnerPdfPage pageKey={`session-page-${sessionRoot.id}`} title="Sessão do Compositor" {...innerCommon}>
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

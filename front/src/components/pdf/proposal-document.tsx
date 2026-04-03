
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
import type { BudgetItem } from '@/types/budget-types';

interface ProposalDocumentProps {
    budget: Budget;
    settings: ProposalSettings;
    /** Quando presente, sumário/lista de figuras seguem o compositor; detalhamento continua pelo Escopo (`locations`). */
    compositorPdf?: CompositorPdfPayload;
}

const styles = StyleSheet.create({
    pageWithWatermark: {
        position: 'relative',
    },
    documentWatermarkLayer: {
        position: 'absolute',
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        zIndex: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    documentWatermarkImage: {
        width: '82%',
        height: '82%',
        objectFit: 'contain',
    },
    contentPage: {
        padding: 35,
        paddingTop: 35,
        paddingBottom: 50,
        fontFamily: theme.fonts.body,
        fontSize: 11,
        lineHeight: 1.5,
        color: theme.colors.text
    },
    header: {
        marginBottom: 20,
        borderBottomWidth: 2,
        borderBottomColor: theme.colors.secondary,
        paddingBottom: 5,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end'
    },
    headerTitle: {
        color: theme.colors.primary,
        fontFamily: theme.fonts.bold,
        fontSize: 14,
        textTransform: 'uppercase'
    },
    footerNumber: {
        position: 'absolute',
        bottom: 20,
        right: 35,
        fontSize: 9,
        color: theme.colors.textLight
    },
    totalBlock: {
        marginTop: 30,
        backgroundColor: theme.colors.bgHeader,
        padding: 15,
        borderRadius: 4,
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
    if (u.startsWith("/")) return origin ? `${origin}${u}` : u;
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

function clampDocumentOpacity(value: number | undefined, fallback: number): number {
    const n = typeof value === "number" ? value : fallback;
    if (!Number.isFinite(n)) return fallback;
    if (n < 0) return 0;
    // Marca d'água das páginas internas precisa ser mais discreta que a capa.
    if (n > 0.12) return 0.12;
    return n;
}

function stripHtmlToText(raw: string | undefined): string {
    if (!raw) return '';
    return raw
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
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
                depth: node.depth,
                page,
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

export const ProposalDocument = ({ budget, settings, compositorPdf }: ProposalDocumentProps) => {
    const validityDays = Number(budget.validity_days ?? 15);
    const formatMoney = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
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
    const docWatermarkSrc = proxyPdfImageSrc(docWatermarkSource, settings.app_public_url);
    const docWatermarkOpacity = clampDocumentOpacity(compositorCoverMerged.document_watermark_opacity, 0.06);

    const renderDocumentWatermark = () =>
        docWatermarkSrc ? (
            <View style={styles.documentWatermarkLayer} fixed>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
                <Image
                    src={docWatermarkSrc}
                    style={[styles.documentWatermarkImage, { opacity: docWatermarkOpacity }]}
                />
            </View>
        ) : null;

    const renderPdfSegment = (seg: PdfSegment, i: number): React.ReactNode => {
        const keyBase = `pdf-${i}-${seg.kind}`;
        switch (seg.kind) {
            case "cover":
                return (
                    <CompositorCoverPdfPage
                        key={keyBase}
                        budget={budget}
                        settings={settings}
                        coverProps={compositorCoverMerged}
                    />
                );
            case "intro":
                return (
                    <Page key={keyBase} size="A4" style={[styles.contentPage, styles.pageWithWatermark]}>
                        {renderDocumentWatermark()}
                        <View style={styles.header}>
                            <Text style={styles.headerTitle}>Apresentação</Text>
                            <Text style={{ fontSize: 9, color: theme.colors.textLight }}>{settings.company_name}</Text>
                        </View>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pdf Style doesn't type whiteSpace */}
                        <Text style={{ whiteSpace: "pre-wrap", textAlign: "justify" } as any}>
                            {settings.introduction_text}
                        </Text>
                        <Text
                            style={styles.footerNumber}
                            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
                            fixed
                        />
                    </Page>
                );
            case "toc":
                return (
                    <Page key={keyBase} size="A4" style={[styles.contentPage, styles.pageWithWatermark]}>
                        {renderDocumentWatermark()}
                        <View style={styles.header}>
                            <Text style={styles.headerTitle}>Sumário</Text>
                            <Text style={{ fontSize: 9, color: theme.colors.textLight }}>{settings.company_name}</Text>
                        </View>
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
                                    style={[styles.tocRow, { paddingLeft: Math.min(row.depth, 6) * 10 }]}
                                    wrap={false}
                                >
                                    <Text style={styles.tocTitle}>
                                        {row.number} {row.title}
                                    </Text>
                                    <View style={styles.tocDots} />
                                    <Text style={styles.tocPage}>{row.page}</Text>
                                </View>
                            ))
                        )}
                        <Text
                            style={styles.footerNumber}
                            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
                            fixed
                        />
                    </Page>
                );
            case "figures":
                return (
                    <Page key={keyBase} size="A4" style={[styles.contentPage, styles.pageWithWatermark]}>
                        {renderDocumentWatermark()}
                        <View style={styles.header}>
                            <Text style={styles.headerTitle}>Lista de Figuras</Text>
                            <Text style={{ fontSize: 9, color: theme.colors.textLight }}>{settings.company_name}</Text>
                        </View>
                        <Text style={{ fontSize: 9, color: theme.colors.textLight, marginBottom: 14 }}>
                            Figuras do Escopo. A página indicada referencia o início do detalhamento impresso.
                        </Text>
                        {figureRows.map((row) => (
                            <View key={`fig-${row.n}`} style={styles.tocRow} wrap={false}>
                                <Text style={styles.tocTitle}>
                                    Figura {row.n} — {row.caption}
                                </Text>
                                <View style={styles.tocDots} />
                                <Text style={styles.tocPage}>{row.page}</Text>
                            </View>
                        ))}
                        <Text
                            style={styles.footerNumber}
                            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
                            fixed
                        />
                    </Page>
                );
            case "detail":
                return (
                    <Page key={keyBase} size="A4" style={[styles.contentPage, styles.pageWithWatermark]}>
                        {renderDocumentWatermark()}
                        <View style={styles.header}>
                            <Text style={styles.headerTitle}>Detalhamento do Projeto</Text>
                        </View>
                        <BudgetTable
                            locations={locations}
                            sectionNumber={budget.section_number ?? 1}
                            showCosts={detailShowCosts}
                            costsDisplayMode={detailCostsMode}
                        />
                        <View style={styles.totalBlock} break={false}>
                            <View>
                                <Text style={{ fontSize: 12, fontFamily: theme.fonts.bold }}>INVESTIMENTO TOTAL</Text>
                                <Text style={{ fontSize: 10 }}>Validade: {validityDays} dias</Text>
                            </View>
                            <Text style={{ fontFamily: theme.fonts.bold, fontSize: 18, color: theme.colors.primary }}>
                                {formatMoney(budget.total_value || 0)}
                            </Text>
                        </View>
                        <Text
                            style={styles.footerNumber}
                            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
                            fixed
                        />
                    </Page>
                );
            case "session": {
                const sessionRoot = seg.block;
                const rows = collectSessionPrintRows(sessionRoot, compositorPdf?.items || {});
                return (
                    <Page
                        key={`session-page-${sessionRoot.id}`}
                        size="A4"
                        style={[styles.contentPage, styles.pageWithWatermark]}
                    >
                        {renderDocumentWatermark()}
                        <View style={styles.header}>
                            <Text style={styles.headerTitle}>Sessão do Compositor</Text>
                            <Text style={{ fontSize: 9, color: theme.colors.textLight }}>{settings.company_name}</Text>
                        </View>
                        <Text style={styles.sessionTitle}>
                            {sessionRoot.number ? `${sessionRoot.number} ` : ""}
                            {(sessionRoot.label || "Sessão").trim()}
                        </Text>
                        {rows.length === 0 ? (
                            <Text style={styles.sessionRowText}>Sem conteúdo textual nesta sessão.</Text>
                        ) : (
                            rows.map((row, idx) => (
                                <View
                                    key={`session-row-${sessionRoot.id}-${idx}`}
                                    style={[styles.sessionRow, { marginLeft: Math.min(row.depth, 5) * 10 }]}
                                >
                                    <Text style={styles.sessionRowTitle}>{row.title}</Text>
                                    {row.text ? <Text style={styles.sessionRowText}>{row.text}</Text> : null}
                                </View>
                            ))
                        )}
                        <Text
                            style={styles.footerNumber}
                            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
                            fixed
                        />
                    </Page>
                );
            }
            case "terms":
                return (
                    <Page key={keyBase} size="A4" style={[styles.contentPage, styles.pageWithWatermark]}>
                        {renderDocumentWatermark()}
                        <View style={styles.header}>
                            <Text style={styles.headerTitle}>Condições Gerais</Text>
                        </View>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pdf Style doesn't type whiteSpace */}
                        <Text style={{ fontSize: 10, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 50 } as any}>
                            {settings.closing_text}
                        </Text>
                        <View
                            style={{
                                flexDirection: "row",
                                marginTop: "auto",
                                marginBottom: 50,
                                justifyContent: "space-between",
                                gap: 40,
                            }}
                        >
                            <View style={{ borderTopWidth: 1, flex: 1, alignItems: "center", paddingTop: 10 }}>
                                <Text style={{ fontSize: 11, fontFamily: theme.fonts.bold }}>{settings.company_name}</Text>
                                <Text style={{ fontSize: 9 }}>Diretoria Comercial</Text>
                            </View>
                            <View style={{ borderTopWidth: 1, flex: 1, alignItems: "center", paddingTop: 10 }}>
                                <Text style={{ fontSize: 11, fontFamily: theme.fonts.bold }}>De Acordo</Text>
                                <Text style={{ fontSize: 9 }}>Cliente</Text>
                            </View>
                        </View>
                        <Text
                            style={styles.footerNumber}
                            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
                            fixed
                        />
                    </Page>
                );
            default:
                return null;
        }
    };

    return <Document>{segments.map((seg, i) => renderPdfSegment(seg, i))}</Document>;
};

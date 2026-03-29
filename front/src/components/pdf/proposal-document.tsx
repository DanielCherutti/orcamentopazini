
import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { Budget } from '@/types/budget-types';
import { ProposalSettings } from '@/actions/settings-actions';
import { theme } from './theme';
import { BudgetTable } from './sections/budget-table';
import { CompositorCoverPdfPage } from './sections/compositor-cover-pdf';
import type { CompositorPdfPayload } from './compositor-pdf-types';
import {
    DEFAULT_COVER_PROPS,
    flattenTree,
    type CoverBlockProps,
} from '@/types/budget-compositor-types';
import { buildTocModel } from '@/components/budgets/compositor/compositor-toc-utils';
import { buildFiguresListModel } from '@/components/budgets/compositor/compositor-figures-utils';

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
});

function mergeCoverProps(raw: Record<string, unknown> | undefined): CoverBlockProps {
    return { ...DEFAULT_COVER_PROPS, ...(raw as CoverBlockProps) };
}

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

function clampOpacity(value: number | undefined, fallback: number): number {
    const n = typeof value === "number" ? value : fallback;
    if (!Number.isFinite(n)) return fallback;
    if (n < 0) return 0;
    if (n > 0.32) return 0.32;
    return n;
}

export const ProposalDocument = ({ budget, settings, compositorPdf }: ProposalDocumentProps) => {
    const validityDays = Number(budget.validity_days ?? 15);
    const formatMoney = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    const hasCompositorStructure =
        !!compositorPdf && Array.isArray(compositorPdf.roots) && compositorPdf.roots.length > 0;

    const coverBlock = compositorPdf
        ? flattenTree(compositorPdf.roots).find((b) => b.type === 'cover')
        : undefined;
    const compositorCoverMerged = mergeCoverProps(coverBlock?.props as Record<string, unknown> | undefined);

    const tocRows = hasCompositorStructure
        ? buildTocModel(compositorPdf!.roots, compositorPdf!.items)
        : [];

    const figureRows = hasCompositorStructure
        ? buildFiguresListModel(
            compositorPdf!.scopeFigures,
            compositorPdf!.roots,
            compositorPdf!.items
        )
        : [];
    const docWatermarkSource =
        compositorCoverMerged.document_watermark_url?.trim()
            ? compositorCoverMerged.document_watermark_url
            : compositorCoverMerged.cover_watermark_url;
    const docWatermarkSrc = proxyPdfImageSrc(docWatermarkSource, settings.app_public_url);
    const docWatermarkOpacity = clampOpacity(compositorCoverMerged.document_watermark_opacity, 0.06);

    return (
        <Document>
            <CompositorCoverPdfPage
                budget={budget}
                settings={settings}
                coverProps={compositorCoverMerged}
            />

            {/* APRESENTAÇÃO */}
            <Page size="A4" style={[styles.contentPage, styles.pageWithWatermark]}>
                {docWatermarkSrc ? (
                    <View style={styles.documentWatermarkLayer} fixed>
                        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
                        <Image src={docWatermarkSrc} style={[styles.documentWatermarkImage, { opacity: docWatermarkOpacity }]} />
                    </View>
                ) : null}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Apresentação</Text>
                    <Text style={{ fontSize: 9, color: theme.colors.textLight }}>{settings.company_name}</Text>
                </View>

                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pdf Style doesn't type whiteSpace */}
                <Text style={{ whiteSpace: 'pre-wrap', textAlign: 'justify' } as any}>
                    {settings.introduction_text}
                </Text>

                <Text style={styles.footerNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
            </Page>

            {/* SUMÁRIO (documento compositor — sessões numeradas) */}
            {hasCompositorStructure ? (
                <Page size="A4" style={[styles.contentPage, styles.pageWithWatermark]}>
                    {docWatermarkSrc ? (
                        <View style={styles.documentWatermarkLayer} fixed>
                            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
                            <Image src={docWatermarkSrc} style={[styles.documentWatermarkImage, { opacity: docWatermarkOpacity }]} />
                        </View>
                    ) : null}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Sumário</Text>
                        <Text style={{ fontSize: 9, color: theme.colors.textLight }}>{settings.company_name}</Text>
                    </View>
                    <Text style={{ fontSize: 9, color: theme.colors.textLight, marginBottom: 14 }}>
                        Páginas estimadas conforme a estrutura atual do Compositor.
                    </Text>
                    {tocRows.length === 0 ? (
                        <Text style={{ fontSize: 10, fontStyle: 'italic', color: theme.colors.textLight }}>
                            Nenhuma sessão numerada no documento. Inclua blocos do tipo &quot;Sessão&quot; no Compositor para
                            aparecerem aqui.
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
                    <Text style={styles.footerNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
                </Page>
            ) : null}

            {/* LISTA DE FIGURAS (Escopo + blocos no compositor) */}
            {hasCompositorStructure && figureRows.length > 0 ? (
                <Page size="A4" style={[styles.contentPage, styles.pageWithWatermark]}>
                    {docWatermarkSrc ? (
                        <View style={styles.documentWatermarkLayer} fixed>
                            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
                            <Image src={docWatermarkSrc} style={[styles.documentWatermarkImage, { opacity: docWatermarkOpacity }]} />
                        </View>
                    ) : null}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Lista de Figuras</Text>
                        <Text style={{ fontSize: 9, color: theme.colors.textLight }}>{settings.company_name}</Text>
                    </View>
                    <Text style={{ fontSize: 9, color: theme.colors.textLight, marginBottom: 14 }}>
                        Figuras dos locais e trechos (aba Escopo e/ou galerias no Compositor). Páginas estimadas.
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
                    <Text style={styles.footerNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
                </Page>
            ) : null}

            {/* DETALHAMENTO — hierarquia Escopo (locais / trechos / itens) */}
            <Page size="A4" style={[styles.contentPage, styles.pageWithWatermark]}>
                {docWatermarkSrc ? (
                    <View style={styles.documentWatermarkLayer} fixed>
                        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
                        <Image src={docWatermarkSrc} style={[styles.documentWatermarkImage, { opacity: docWatermarkOpacity }]} />
                    </View>
                ) : null}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Detalhamento do Projeto</Text>
                </View>

                <BudgetTable locations={budget.locations || []} sectionNumber={budget.section_number ?? 1} />

                <View style={styles.totalBlock} break={false}>
                    <View>
                        <Text style={{ fontSize: 12, fontFamily: theme.fonts.bold }}>INVESTIMENTO TOTAL</Text>
                        <Text style={{ fontSize: 10 }}>Validade: {validityDays} dias</Text>
                    </View>
                    <Text style={{ fontFamily: theme.fonts.bold, fontSize: 18, color: theme.colors.primary }}>
                        {formatMoney(budget.total_value || 0)}
                    </Text>
                </View>

                <Text style={styles.footerNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
            </Page>

            {/* TERMOS E FECHAMENTO */}
            <Page size="A4" style={[styles.contentPage, styles.pageWithWatermark]}>
                {docWatermarkSrc ? (
                    <View style={styles.documentWatermarkLayer} fixed>
                        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
                        <Image src={docWatermarkSrc} style={[styles.documentWatermarkImage, { opacity: docWatermarkOpacity }]} />
                    </View>
                ) : null}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Condições Gerais</Text>
                </View>

                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pdf Style doesn't type whiteSpace */}
                <Text style={{ fontSize: 10, lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 50 } as any}>
                    {settings.closing_text}
                </Text>

                <View style={{ flexDirection: 'row', marginTop: 'auto', marginBottom: 50, justifyContent: 'space-between', gap: 40 }}>
                    <View style={{ borderTopWidth: 1, flex: 1, alignItems: 'center', paddingTop: 10 }}>
                        <Text style={{ fontSize: 11, fontFamily: theme.fonts.bold }}>{settings.company_name}</Text>
                        <Text style={{ fontSize: 9 }}>Diretoria Comercial</Text>
                    </View>
                    <View style={{ borderTopWidth: 1, flex: 1, alignItems: 'center', paddingTop: 10 }}>
                        <Text style={{ fontSize: 11, fontFamily: theme.fonts.bold }}>De Acordo</Text>
                        <Text style={{ fontSize: 9 }}>Cliente</Text>
                    </View>
                </View>

                <Text style={styles.footerNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
            </Page>
        </Document>
    );
};

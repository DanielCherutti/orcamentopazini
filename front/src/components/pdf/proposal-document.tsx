
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
    /** Quando presente, capa/sumário/lista de figuras seguem o compositor; detalhamento continua pelo Escopo (`locations`). */
    compositorPdf?: CompositorPdfPayload;
}

const styles = StyleSheet.create({
    page: {
        fontFamily: theme.fonts.body,
        backgroundColor: '#FFFFFF',
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 0,
    },
    coverPage: {
        flex: 1,
        flexDirection: 'column',
        backgroundColor: theme.colors.primary,
        color: theme.colors.textWhite,
        justifyContent: 'space-between',
        padding: 50
    },
    coverLogo: {
        width: 150,
        height: 60,
        objectFit: 'contain',
        marginBottom: 50
    },
    coverTitle: {
        fontSize: 36,
        fontFamily: theme.fonts.bold,
        marginBottom: 20,
        textTransform: 'uppercase'
    },
    coverSubtitle: {
        fontSize: 18,
        fontFamily: theme.fonts.body,
        opacity: 0.9
    },
    coverFooter: {
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.3)',
        paddingTop: 20,
        flexDirection: 'row',
        justifyContent: 'space-between'
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

export const ProposalDocument = ({ budget, settings, compositorPdf }: ProposalDocumentProps) => {
    const issueDate =
        budget.issue_date
            ? new Date(budget.issue_date)
            : budget.created_at
                ? new Date(budget.created_at)
                : new Date();

    const formattedDate = issueDate.toLocaleDateString('pt-BR');
    const validityDays = Number(budget.validity_days ?? 15);
    const formatMoney = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    type ResolvedClient = { id?: string; name?: string; city?: string; cnpj?: string };
    const clientText = (() => {
        const client = budget.client_id as string | ResolvedClient;
        if (!client) return "Cliente não definido";
        if (typeof client === "string") return client;
        const parts = [client.name, client.city, client.cnpj].filter(Boolean);
        return parts.length > 0 ? parts.join(" - ") : (client.id ? String(client.id) : "Cliente não definido");
    })();

    const useCompositorLayout =
        !!compositorPdf && Array.isArray(compositorPdf.roots) && compositorPdf.roots.length > 0;

    const coverBlock = useCompositorLayout
        ? flattenTree(compositorPdf!.roots).find((b) => b.type === 'cover')
        : undefined;
    const compositorCoverMerged = useCompositorLayout
        ? mergeCoverProps(coverBlock?.props as Record<string, unknown> | undefined)
        : null;

    const tocRows = useCompositorLayout
        ? buildTocModel(compositorPdf!.roots, compositorPdf!.items)
        : [];

    const figureRows = useCompositorLayout
        ? buildFiguresListModel(
            compositorPdf!.scopeFigures,
            compositorPdf!.roots,
            compositorPdf!.items
        )
        : [];

    return (
        <Document>
            {useCompositorLayout && compositorCoverMerged ? (
                <CompositorCoverPdfPage
                    budget={budget}
                    settings={settings}
                    coverProps={compositorCoverMerged}
                />
            ) : (
                <Page size="A4" style={styles.page}>
                    <View style={styles.coverPage}>
                        <View>
                            {settings.company_logo_url ? (
                                /* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */
                                <Image src={settings.company_logo_url} style={styles.coverLogo} />
                            ) : (
                                <Text style={{ fontSize: 24, fontFamily: theme.fonts.bold, marginBottom: 40 }}>{settings.company_name}</Text>
                            )}
                            <Text style={styles.coverTitle}>Proposta Comercial</Text>
                            <Text style={styles.coverSubtitle}>{budget.title}</Text>
                            <Text style={{ fontSize: 12, marginTop: 10, opacity: 0.8 }}>Ref: {budget.code}</Text>
                        </View>

                        <View style={styles.coverFooter}>
                            <View>
                                <Text style={{ fontSize: 10, opacity: 0.8 }}>A/C</Text>
                                <Text style={{ fontSize: 14, fontFamily: theme.fonts.bold }}>{clientText}</Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={{ fontSize: 10, opacity: 0.8 }}>Emissão</Text>
                                <Text style={{ fontSize: 14 }}>{formattedDate}</Text>
                            </View>
                        </View>
                    </View>
                </Page>
            )}

            {/* APRESENTAÇÃO */}
            <Page size="A4" style={styles.contentPage}>
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
            {useCompositorLayout ? (
                <Page size="A4" style={styles.contentPage}>
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
            {useCompositorLayout && figureRows.length > 0 ? (
                <Page size="A4" style={styles.contentPage}>
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
            <Page size="A4" style={styles.contentPage}>
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
            <Page size="A4" style={styles.contentPage}>
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

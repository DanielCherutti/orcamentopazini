
import React from 'react';
import { Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { theme } from '../theme';
import { BudgetImage, BudgetItem, BudgetLocation } from '@/types/budget-types';
import {
    computeItemAdjustmentValue,
    computeItemSubtotal,
    computeLocationAssemblyTotal,
    distributeProportional,
    type CostDisplayMode,
    type LocationAssemblyMode,
} from '@/lib/budgets/scope-pricing';
import { type PdfEmbeddedImages, proxyPdfImageSrc } from '@/lib/pdf/pdf-image-src';
import { stripHtmlToText } from '@/lib/pdf/html-to-plain-text';
import { sanitizeTextForPdf } from '@/lib/pdf/sanitize-pdf-text';
import { splitCoverHtmlFragmentToSegments } from '@/lib/pdf/cover-pdf-blocks';
import { parsePdfInlineRuns, pdfInlineRunStyle } from '@/lib/pdf/pdf-rich-text-runs';
const styles = StyleSheet.create({
    locationBlock: {
        marginBottom: 20
    },
    locationHeaderWrap: {
        marginTop: 4,
        paddingBottom: 5,
        marginBottom: 6,
        borderBottomWidth: 1.5,
        borderBottomColor: theme.colors.primary,
    },
    locationHeaderText: {
        fontSize: 16,
        fontFamily: theme.fonts.bold,
        color: theme.colors.primary,
    },
    locationHeaderDescription: {
        marginTop: 3,
        fontSize: 9,
        color: theme.colors.text,
        fontFamily: theme.fonts.boldOblique,
    },
    sectionBlock: {
        marginBottom: 12,
        paddingLeft: 0,
        borderWidth: 1,
        borderColor: '#d8dee9',
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        borderBottomRightRadius: 8,
        borderBottomLeftRadius: 8,
        backgroundColor: '#ffffff',
        padding: 8,
    },
    locationPhotosBlock: {
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        borderBottomRightRadius: 8,
        borderBottomLeftRadius: 8,
        backgroundColor: '#ffffff',
        padding: 8,
    },
    locationPhotosTitle: {
        fontSize: 11,
        fontFamily: theme.fonts.bold,
        color: '#1f2937',
        marginBottom: 6,
        backgroundColor: '#f3f4f6',
        borderColor: '#d1d5db',
        borderWidth: 1,
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
        borderBottomRightRadius: 6,
        borderBottomLeftRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 4,
    },
    /** Mesmo estilo do cabeçalho do local (listra em largura total). */
    sectionHeaderWrap: {
        marginTop: 4,
        paddingBottom: 5,
        marginBottom: 6,
        width: '100%',
        alignSelf: 'stretch',
        borderBottomWidth: 1.5,
        borderBottomColor: theme.colors.primary,
    },
    sectionHeaderText: {
        fontSize: 16,
        fontFamily: theme.fonts.bold,
        color: theme.colors.primary,
    },
    sectionDescription: {
        marginTop: 6,
    },
    sectionDescriptionParagraph: {
        fontSize: 9,
        color: theme.colors.text,
        lineHeight: 1.4,
        marginBottom: 5,
        textAlign: 'justify',
    },
    sectionDescriptionHeading: {
        fontSize: 10,
        color: theme.colors.text,
        fontFamily: theme.fonts.bold,
        lineHeight: 1.3,
        marginBottom: 4,
    },
    sceneGrid: {
        width: '100%',
        alignItems: 'center',
    },
    sceneGridRow: {
        flexDirection: 'row',
        gap: 8,
        width: '100%',
        marginBottom: 6,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sceneCard: {
        flex: 1,
        height: 228,
        borderTopLeftRadius: 4,
        borderTopRightRadius: 4,
        borderBottomRightRadius: 4,
        borderBottomLeftRadius: 4,
        backgroundColor: '#ffffff',
        padding: 2,
    },
    sceneCardFull: {
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: 390,
        width: 390,
        height: 258,
        alignSelf: 'center',
    },
    sceneCardSpacer: {
        flex: 1,
    },
    sceneImageFrame: {
        width: '100%',
        height: 190,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ffffff',
        marginBottom: 1,
    },
    sceneImageFrameFull: {
        height: 218,
    },
    sceneImage: {
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        objectPosition: 'center',
    },
    sceneCaptionRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'baseline',
        width: '100%',
        paddingHorizontal: 8,
        gap: 6,
    },
    sceneCaptionLabel: {
        fontSize: 8,
        fontFamily: theme.fonts.bold,
        color: theme.colors.text,
        flexShrink: 0,
    },
    sceneCaption: {
        fontSize: 7.5,
        color: theme.colors.textLight,
        fontFamily: theme.fonts.oblique,
        lineHeight: 1.2,
        maxLines: 3,
        textAlign: 'center',
        flexShrink: 1,
        maxWidth: 280,
    },
    sceneObservation: {
        marginTop: 1,
        fontSize: 6.6,
        color: theme.colors.textLight,
        fontFamily: theme.fonts.oblique,
        lineHeight: 1.15,
        maxLines: 2,
        textAlign: 'center',
    },
    pdfPageRoot: {
        width: '100%',
    },
    /** Conteúdo contínuo após foto/título — permite quebra de página (ex.: tabela longa). */
    pdfFlowRoot: {
        width: '100%',
    },
    sectionPageBlock: {
        width: '100%',
    },
    table: {
        marginTop: 5,
        width: '100%',
    },
    tableHeaderShell: {
        width: '100%',
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: '#d1d5db',
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
    },
    tableHeader: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#d1d5db',
        paddingVertical: 5,
        paddingHorizontal: 6,
        backgroundColor: '#f3f4f6',
    },
    /**
     * Bloco indivisível por linha. borderBottom no mesmo View evita o filho “foot”
     * ir para a página seguinte na quebra (causa comum de borda inferior ausente).
     */
    tableRowShell: {
        width: '100%',
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 2,
        borderColor: '#d1d5db',
    },
    tableRowShellLast: {
        borderBottomWidth: 2,
        borderBottomLeftRadius: 6,
        borderBottomRightRadius: 6,
    },
    /** Reforço no fim absoluto da tabela (última página). */
    tableEndCap: {
        width: '100%',
        height: 2,
        backgroundColor: '#d1d5db',
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#d1d5db',
        borderBottomLeftRadius: 6,
        borderBottomRightRadius: 6,
    },
    tableRow: {
        flexDirection: 'row',
        paddingVertical: 6,
        paddingHorizontal: 6,
        alignItems: 'center',
    },
    colCode: { flex: 6, paddingRight: 4 },
    colDesc: { flex: 17, paddingRight: 5 },
    colNcm: { flex: 7, paddingRight: 4 },
    colQty: { flex: 4, textAlign: 'center' },
    colUnit: { flex: 3, textAlign: 'center' },
    colMoney: { flex: 7, textAlign: 'right' },
    colTotal: { flex: 10, textAlign: 'right' },
    subtotalRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 4,
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
        borderBottomRightRadius: 6,
        borderBottomLeftRadius: 6,
        paddingVertical: 4,
        paddingHorizontal: 8,
    },

    textSmall: { fontSize: 8.7, color: theme.colors.text },
    textBold: { fontFamily: theme.fonts.bold, color: theme.colors.text },
    itemObservationText: { fontFamily: theme.fonts.boldOblique }
});

const formatMoney = (val: number) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return '—';
    const safe = Math.min(Math.max(n, -1e15), 1e15);
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safe);
};

function singleLinePdfLabel(input: unknown): string {
    return String(input ?? '')
        .replace(/\s+/g, ' ')
        .trim();
}

function renderSectionDescription(rawHtml: unknown, keyPrefix: string): React.ReactNode {
    const html = String(rawHtml ?? '');
    if (!stripHtmlToText(html).trim()) return null;

    const segments = splitCoverHtmlFragmentToSegments(html);
    if (segments.length === 0) return null;

    return (
        <View style={styles.sectionDescription}>
            {segments.map((segment, segmentIndex) => {
                const runs = segment.rawHtml ? parsePdfInlineRuns(segment.rawHtml) : [];
                const layoutStyle = {
                    ...(segment.textAlign ? { textAlign: segment.textAlign } : {}),
                    ...(segment.lineHeight ? { lineHeight: segment.lineHeight } : {}),
                    ...(segment.marginTopPt ? { marginTop: segment.marginTopPt } : {}),
                    ...(segment.marginBottomPt ? { marginBottom: segment.marginBottomPt } : {}),
                    ...(segment.marginLeftPt || segment.listMarker
                        ? { marginLeft: (segment.marginLeftPt ?? 0) + (segment.listMarker ? (segment.listDepth ?? 1) * 12 : 0) }
                        : {}),
                    ...(segment.marginRightPt ? { marginRight: segment.marginRightPt } : {}),
                    ...(segment.textIndentPt || segment.listMarker
                        ? { textIndent: (segment.textIndentPt ?? 0) - (segment.listMarker ? 10 : 0) }
                        : {}),
                };
                return (
                    <Text
                        key={`${keyPrefix}-description-${segmentIndex}`}
                        style={[
                            segment.kind === 'heading'
                                ? styles.sectionDescriptionHeading
                                : styles.sectionDescriptionParagraph,
                            layoutStyle,
                        ]}
                    >
                        {segment.listMarker ? `${segment.listMarker} ` : null}
                        {runs.length
                            ? runs.map((run, runIndex) => (
                                  <Text
                                      key={`${keyPrefix}-description-${segmentIndex}-${runIndex}`}
                                      style={pdfInlineRunStyle(run)}
                                  >
                                      {run.text}
                                  </Text>
                              ))
                            : segment.text}
                    </Text>
                );
            })}
        </View>
    );
}

function getLocationAssemblyMode(location: BudgetLocation): LocationAssemblyMode {
    const raw = String((location as unknown as Record<string, unknown>).assembly_mode ?? 'percent');
    if (raw === 'fixed' || raw === 'manual') return raw;
    return 'percent';
}

function getLocationAssemblyValue(location: BudgetLocation): number {
    return Number((location as unknown as Record<string, unknown>).assembly_value ?? 0);
}

function computeLocationItemValues(location: BudgetLocation) {
    const allItems = (location.sections ?? []).flatMap((section) => section.items ?? []);
    const mode = getLocationAssemblyMode(location);
    const assemblyTotal = computeLocationAssemblyTotal(mode, getLocationAssemblyValue(location), allItems);
    const assemblyByItem =
        mode === 'manual'
            ? Object.fromEntries(
                  allItems
                      .filter((item) => !!item.id)
                      .map((item) => [
                          String(item.id),
                          Number(
                              (item as unknown as Record<string, unknown>).assembly_manual_value ?? 0
                          ),
                      ])
              )
            : distributeProportional(allItems, assemblyTotal);
    const itemFinalValue = new Map<string, number>();
    allItems.forEach((item) => {
        if (!item.id) return;
        const subtotal = computeItemSubtotal(item);
        const assemblyExtra = Number(assemblyByItem[String(item.id)] ?? 0);
        itemFinalValue.set(String(item.id), subtotal + assemblyExtra);
    });
    return { itemFinalValue, assemblyTotal };
}

function itemCode(item: BudgetItem): string {
    const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    const row = item as unknown as Record<string, unknown>;
    const pidObj =
        typeof item.product_id === 'object' && item.product_id
            ? (item.product_id as Record<string, unknown>)
            : undefined;
    const pd =
        row.product_data && typeof row.product_data === 'object'
            ? (row.product_data as Record<string, unknown>)
            : undefined;

    return (
        clean(item.product_code) ||
        clean(row.product_code) ||
        clean(pd?.code) ||
        clean(pidObj?.code) ||
        '—'
    );
}

function itemLabel(item: BudgetItem): string {
    const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    const isGeneric = (s: string): boolean => {
        const n = s.toLowerCase();
        return n === '' || n === 'produto' || n === 'product' || n === 'item';
    };
    const row = item as unknown as Record<string, unknown>;
    const pidObj =
        typeof item.product_id === 'object' && item.product_id
            ? (item.product_id as Record<string, unknown>)
            : undefined;
    const pd =
        row.product_data && typeof row.product_data === 'object'
            ? (row.product_data as Record<string, unknown>)
            : undefined;

    const candidates = [
        clean(item.product_name),
        clean(row.product_name),
        clean(pidObj?.description),
        clean(pidObj?.name),
        clean(pidObj?.title),
        clean(pd?.description),
        clean(pd?.name),
        clean(pd?.title),
        clean(row.description),
        clean(row.name),
        clean(row.title),
        clean(pd?.code),
        clean(pidObj?.code),
    ];
    const best = candidates.find((s) => !isGeneric(s));
    return best || clean(item.product_name) || 'Produto';
}

function itemNcm(item: BudgetItem): string {
    const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    const row = item as unknown as Record<string, unknown>;
    const pidObj =
        typeof item.product_id === 'object' && item.product_id
            ? (item.product_id as Record<string, unknown>)
            : undefined;
    const pd =
        row.product_data && typeof row.product_data === 'object'
            ? (row.product_data as Record<string, unknown>)
            : undefined;
    return clean(item.product_ncm) || clean(row.product_ncm) || clean(pd?.ncm) || clean(pidObj?.ncm) || '—';
}

function itemUnit(item: BudgetItem): string {
    const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    const row = item as unknown as Record<string, unknown>;
    const pidObj =
        typeof item.product_id === 'object' && item.product_id
            ? (item.product_id as Record<string, unknown>)
            : undefined;
    const pd =
        row.product_data && typeof row.product_data === 'object'
            ? (row.product_data as Record<string, unknown>)
            : undefined;
    return (
        clean(item.product_unit) ||
        clean(row.product_unit) ||
        clean(pd?.unit) ||
        clean(pidObj?.unit) ||
        'UN'
    );
}

function sectionWantsLaborSplitOnPrint(sec: { items?: BudgetItem[] }): boolean {
    const items = sec.items ?? [];
    return items.some((item) => {
        const r = item as unknown as Record<string, unknown>;
        return Number(item.labor_cost ?? 0) > 0 && Boolean(r.labor_show_on_print);
    });
}

function SectionItemsTable({
    sec,
    showCosts,
    laborCols,
    costsDisplayMode,
    itemFinalValue,
}: {
    sec: { id?: string; items?: BudgetItem[] };
    showCosts: boolean;
    laborCols: boolean;
    costsDisplayMode: CostDisplayMode;
    itemFinalValue: Map<string, number>;
}) {
    const items = sec.items ?? [];
    return (
        <View style={styles.table} wrap>
            <View
                wrap={false}
                style={styles.tableHeaderShell}
                minPresenceAhead={items.length > 0 ? TABLE_HEADER_KEEP_WITH_NEXT_PT : 0}
            >
                <SectionTableHeader showCosts={showCosts} laborCols={laborCols} />
            </View>
            {items.map((item, idx) => {
                const finalVal = Number(itemFinalValue.get(String(item.id)) ?? 0);
                const cells = pdfItemValueCells(item, finalVal, laborCols);
                const showObservation = Boolean(
                    (item as unknown as Record<string, unknown>).observation_show_on_print
                );
                const observationText = stripHtmlToText(
                    String((item as unknown as Record<string, unknown>).observation_text ?? '')
                ).trim();
                const isLastRow = idx === items.length - 1;
                const rowBlock = (
                    <View
                        style={[
                            styles.tableRowShell,
                            ...(isLastRow ? [styles.tableRowShellLast] : []),
                        ]}
                    >
                        <View
                            style={[
                                styles.tableRow,
                                {
                                    backgroundColor:
                                        idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                                },
                            ]}
                        >
                            <Text style={[styles.textSmall, styles.colCode]}>
                                {sanitizeTextForPdf(itemCode(item))}
                            </Text>
                            <Text style={[styles.textSmall, styles.colDesc]}>
                                {sanitizeTextForPdf(itemLabel(item))}
                                {showObservation && observationText ? (
                                    <Text style={styles.itemObservationText}>
                                        {sanitizeTextForPdf(` - Obs: ${observationText}`)}
                                    </Text>
                                ) : null}
                            </Text>
                            <Text style={[styles.textSmall, styles.colNcm]}>
                                {sanitizeTextForPdf(itemNcm(item))}
                            </Text>
                            <Text style={[styles.textSmall, styles.colQty]}>
                                {sanitizeTextForPdf(String(item.quantity ?? '').trim())}
                            </Text>
                            <Text style={[styles.textSmall, styles.colUnit]}>
                                {sanitizeTextForPdf(itemUnit(item))}
                            </Text>
                            {showCosts && laborCols ? (
                                <>
                                    <Text style={[styles.textSmall, styles.colMoney]}>
                                        {cells.equip}
                                    </Text>
                                    <Text style={[styles.textSmall, styles.colMoney]}>
                                        {cells.mo}
                                    </Text>
                                    <Text style={[styles.textSmall, styles.colTotal]}>
                                        {cells.total}
                                    </Text>
                                </>
                            ) : showCosts ? (
                                <Text style={[styles.textSmall, styles.colTotal]}>
                                    {formatMoney(finalVal)}
                                </Text>
                            ) : null}
                        </View>
                    </View>
                );
                if (!isLastRow) {
                    return (
                        <View
                            key={item.id}
                            wrap={false}
                            minPresenceAhead={idx >= items.length - 3 ? TABLE_TAIL_KEEP_TOGETHER_PT : 0}
                        >
                            {rowBlock}
                        </View>
                    );
                }
                return (
                    <View
                        key={item.id}
                        wrap={false}
                        minPresenceAhead={showCosts && costsDisplayMode === 'section' ? 28 : 0}
                    >
                        {rowBlock}
                        <View style={styles.tableEndCap} />
                    </View>
                );
            })}
            {showCosts && costsDisplayMode === 'section' ? (
                <View style={styles.subtotalRow} wrap={false}>
                    <Text style={[styles.textSmall, styles.textBold]}>
                        Total trecho:{' '}
                        {formatMoney(
                            items.reduce(
                                (sum, item) => sum + Number(itemFinalValue.get(String(item.id)) ?? 0),
                                0
                            )
                        )}
                    </Text>
                </View>
            ) : null}
        </View>
    );
}

function SectionTableHeader({
    showCosts,
    laborCols,
}: {
    showCosts: boolean;
    laborCols: boolean;
}) {
    return (
        <View style={styles.tableHeader}>
            <Text style={[styles.textSmall, styles.textBold, styles.colCode]}>CÓDIGO</Text>
            <Text style={[styles.textSmall, styles.textBold, styles.colDesc]}>DESCRIÇÃO</Text>
            <Text style={[styles.textSmall, styles.textBold, styles.colNcm]}>NCM</Text>
            <Text style={[styles.textSmall, styles.textBold, styles.colQty]}>QTD</Text>
            <Text style={[styles.textSmall, styles.textBold, styles.colUnit]}>UN</Text>
            {showCosts && laborCols ? (
                <>
                    <Text style={[styles.textSmall, styles.textBold, styles.colMoney]}>EQUIP. (R$)</Text>
                    <Text style={[styles.textSmall, styles.textBold, styles.colMoney]}>M.O. (R$)</Text>
                    <Text style={[styles.textSmall, styles.textBold, styles.colTotal]}>TOTAL (R$)</Text>
                </>
            ) : showCosts ? (
                <Text style={[styles.textSmall, styles.textBold, styles.colTotal]}>VALOR (R$)</Text>
            ) : null}
        </View>
    );
}

function filterSceneImages(images: BudgetImage[] | undefined): BudgetImage[] {
    return (images ?? []).filter((img) => {
        const raw = img?.composed_url || img?.url;
        return typeof raw === 'string' && raw.trim().length > 0;
    });
}

function figureCaption(sceneImg: BudgetImage): string {
    const caption = singleLinePdfLabel(sceneImg.caption);
    return caption || 'Sem descrição';
}

function figureObservation(sceneImg: BudgetImage): string {
    const row = sceneImg as unknown as Record<string, unknown>;
    const raw =
        row.observation_text ??
        row.observation ??
        row.notes ??
        row.note ??
        '';
    return stripHtmlToText(String(raw)).replace(/\s+/g, ' ').trim();
}

const SCENE_TITLE_KEEP_WITH_NEXT_PT = 270;
const LOCATION_PHOTOS_KEEP_WITH_NEXT_PT = SCENE_TITLE_KEEP_WITH_NEXT_PT + 42;
const SECTION_TABLE_TITLE_KEEP_WITH_NEXT_PT = 88;
const TABLE_HEADER_KEEP_WITH_NEXT_PT = 46;
const TABLE_TAIL_KEEP_TOGETHER_PT = 58;

function chunkPairs<T>(items: T[]): Array<[T, T | undefined]> {
    const out: Array<[T, T | undefined]> = [];
    for (let i = 0; i < items.length; i += 2) {
        out.push([items[i], items[i + 1]]);
    }
    return out;
}

function SceneImageCard({
    sceneImg,
    imageKey,
    figureLabel,
    pdfImagePublicBase,
    pdfEmbeddedImages,
    figurePageCollector,
    fullWidth = false,
}: {
    sceneImg: BudgetImage;
    imageKey: string;
    figureLabel: string;
    pdfImagePublicBase?: string;
    pdfEmbeddedImages?: PdfEmbeddedImages;
    figurePageCollector?: { segmentStartPages: Record<string, number> };
    fullWidth?: boolean;
}) {
    // Prioriza a imagem composta, com fallback para a original.
    const raw = sceneImg?.composed_url || sceneImg?.url;
    if (!raw) return null;
    const src = proxyPdfImageSrc(raw, pdfImagePublicBase, pdfEmbeddedImages) ?? raw;
    const figureId = sceneImg?.id ? String(sceneImg.id) : undefined;
    const observation = figureObservation(sceneImg);

    return (
        <View
            key={imageKey}
            style={[styles.sceneCard, ...(fullWidth ? [styles.sceneCardFull] : [])]}
            wrap={false}
        >
            {figurePageCollector && figureId ? (
                <View
                    render={({ pageNumber }: { pageNumber: number }) => {
                        const key = `figure:${figureId}`;
                        // O React-PDF pode chamar `render` durante paginações provisórias.
                        // A última chamada corresponde à posição final deste cartão (não é `fixed`).
                        // eslint-disable-next-line react-hooks/immutability -- coletor mutável usado pela primeira passada do React-PDF
                        figurePageCollector.segmentStartPages[key] = pageNumber;
                        return null;
                    }}
                    /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pdf */
                    style={{ width: 0, height: 0, opacity: 0 } as any}
                />
            ) : null}
            {figurePageCollector && figureId ? (
                <Text
                    /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- fallback extra em texto invisível */
                    style={{ fontSize: 0.1, lineHeight: 0.1, color: "#ffffff", opacity: 0 } as any}
                    render={({ pageNumber }) => {
                        const key = `figure:${figureId}`;
                        // eslint-disable-next-line react-hooks/immutability -- fallback da coleta na paginação final
                        figurePageCollector.segmentStartPages[key] = pageNumber;
                        return "";
                    }}
                />
            ) : null}
            <View wrap={false}>
                <View
                    style={[
                        styles.sceneImageFrame,
                        ...(fullWidth ? [styles.sceneImageFrameFull] : []),
                    ]}
                >
                    {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
                    <Image src={src} style={styles.sceneImage} />
                </View>
                <View style={styles.sceneCaptionRow}>
                    <Text style={styles.sceneCaptionLabel}>{sanitizeTextForPdf(figureLabel)}</Text>
                    <Text style={styles.sceneCaption}>{sanitizeTextForPdf(figureCaption(sceneImg))}</Text>
                </View>
            </View>
            {observation ? (
                <Text style={styles.sceneObservation}>
                    {sanitizeTextForPdf(`Obs: ${observation}`)}
                </Text>
            ) : null}
        </View>
    );
}

function SceneImagesGrid({
    images,
    figureLabelFor,
    pdfImagePublicBase,
    pdfEmbeddedImages,
    figurePageCollector,
    lead,
}: {
    images: BudgetImage[];
    figureLabelFor: (image: BudgetImage, index: number) => string;
    pdfImagePublicBase?: string;
    pdfEmbeddedImages?: PdfEmbeddedImages;
    figurePageCollector?: { segmentStartPages: Record<string, number> };
    lead?: React.ReactNode;
}) {
    const rows = chunkPairs(images);
    const singleImage = images.length === 1;
    const renderRow = ([left, right]: [BudgetImage, BudgetImage | undefined], rowIdx: number) => (
        <View key={`scene-row-${rowIdx}`} style={styles.sceneGridRow} wrap={false}>
            <SceneImageCard
                sceneImg={left}
                imageKey={left.id ?? `left-${rowIdx}`}
                figureLabel={figureLabelFor(left, rowIdx * 2)}
                pdfImagePublicBase={pdfImagePublicBase}
                pdfEmbeddedImages={pdfEmbeddedImages}
                figurePageCollector={figurePageCollector}
                fullWidth={singleImage}
            />
            {right ? (
                <SceneImageCard
                    sceneImg={right}
                    imageKey={right.id ?? `right-${rowIdx}`}
                    figureLabel={figureLabelFor(right, rowIdx * 2 + 1)}
                    pdfImagePublicBase={pdfImagePublicBase}
                    pdfEmbeddedImages={pdfEmbeddedImages}
                    figurePageCollector={figurePageCollector}
                />
            ) : singleImage ? null : (
                <View style={styles.sceneCardSpacer} />
            )}
        </View>
    );

    return (
        <View style={styles.sceneGrid}>
            {lead && rows[0] ? lead : null}
            {lead && rows[0] ? renderRow(rows[0], 0) : null}
            {rows.slice(lead ? 1 : 0).map((row, idx) => renderRow(row, idx + (lead ? 1 : 0)))}
        </View>
    );
}

function adjustmentMoneyForPdfItem(item: BudgetItem): number {
    const r = item as unknown as Record<string, unknown>;
    const modeRaw = r.price_adjustment_mode;
    const mode = modeRaw === 'percent' || modeRaw === 'fixed' ? modeRaw : null;
    return computeItemAdjustmentValue({
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0,
        labor_cost: Number(item.labor_cost) || 0,
        price_adjustment_mode: mode,
        price_adjustment_value: Number(r.price_adjustment_value ?? 0),
    });
}

/**
 * Colunas de valor no PDF: com split, Equip. / M.O. / Total; sem split (ou sem MO na linha), só Total.
 * M.O. embutida: equip mostra subtotal (equip+labor+ajuste+extra), M.O. "—", Total com montagem.
 */
function pdfItemValueCells(
    item: BudgetItem,
    itemFinalValue: number,
    showLaborColumns: boolean
): { equip: string; mo: string; total: string } {
    const r = item as unknown as Record<string, unknown>;
    const qty = Number(item.quantity) || 1;
    const unit = Number(item.unit_price) || 0;
    const labor = Number(item.labor_cost) || 0;
    const obs = Number(r.observation_extra_value ?? 0);
    const adj = adjustmentMoneyForPdfItem(item);
    const baseE = qty * unit;
    const baseL = qty * labor;
    const base = baseE + baseL;
    const subtotal = base + adj + obs;
    const totalStr = formatMoney(itemFinalValue);

    if (!showLaborColumns) {
        return { equip: '', mo: '', total: totalStr };
    }

    const split = labor > 0 && Boolean(r.labor_show_on_print);
    if (!split) {
        return {
            equip: formatMoney(subtotal),
            mo: '—',
            total: totalStr,
        };
    }
    const propE = base > 0 ? baseE / base : 1;
    const propL = base > 0 ? baseL / base : 0;
    return {
        equip: formatMoney(baseE + adj * propE + obs),
        mo: formatMoney(baseL + adj * propL),
        total: totalStr,
    };
}

export function BudgetTable({
    locations,
    sectionNumber = 1,
    showCosts = false,
    costsDisplayMode = 'section',
    pdfImagePublicBase,
    pdfEmbeddedImages,
    figurePageCollector,
}: {
    locations: BudgetLocation[];
    sectionNumber?: number;
    showCosts?: boolean;
    costsDisplayMode?: CostDisplayMode;
    /** Base pública (ex. `settings.app_public_url`) para proxy `/api/pdf/image` nas cenas compostas. */
    pdfImagePublicBase?: string;
    pdfEmbeddedImages?: PdfEmbeddedImages;
    /** Primeira passada do PDF: coleta página real por figura (`figure:<id>`). */
    figurePageCollector?: { segmentStartPages: Record<string, number> };
}) {
    // Sem hooks: BudgetTable é renderizado pelo @react-pdf/renderer (fora do React DOM).
    const pdfPages: React.ReactNode[] = [];
    const pushPdfPage = (
        pageKey: string,
        content: React.ReactNode,
        opts?: { breakBefore?: boolean }
    ) => {
        pdfPages.push(
            <View key={pageKey} style={styles.pdfPageRoot} break={opts?.breakBefore || undefined}>
                {content}
            </View>
        );
    };

    /** Continua no fluxo da página — tabela longa pode quebrar em várias folhas. */
    const pushFlowBlock = (
        blockKey: string,
        content: React.ReactNode,
        opts?: { breakBefore?: boolean }
    ) => {
        pdfPages.push(
            <View key={blockKey} style={styles.pdfFlowRoot} break={opts?.breakBefore || undefined}>
                {content}
            </View>
        );
    };

    let hasPrintedDetailBlock = false;
    let nextFigureNumber = 1;

    for (const [locIdx, loc] of locations.entries()) {
        const locNum = `${sectionNumber}.${locIdx + 1}`;
        const locLabel = singleLinePdfLabel(loc.name);
        const locDescription = singleLinePdfLabel(stripHtmlToText(String(loc.description ?? '')));
        const sections = loc.sections ?? [];
        const { itemFinalValue } = computeLocationItemValues(loc);
        const locationTotal = sections.reduce((sum, sec) => {
            const sectionTotal = (sec.items ?? []).reduce((acc, item) => {
                if (!item.id) return acc;
                return acc + Number(itemFinalValue.get(String(item.id)) ?? 0);
            }, 0);
            return sum + sectionTotal;
        }, 0);
        const locPhotoList = filterSceneImages(loc.images);
        const locHasPhotos = locPhotoList.length > 0;
        const locId = String(loc.id ?? `loc-${locIdx}`);

        const locationHeader = (
            <View
                style={styles.locationHeaderWrap}
                minPresenceAhead={locHasPhotos ? LOCATION_PHOTOS_KEEP_WITH_NEXT_PT : undefined}
            >
                <Text style={styles.locationHeaderText}>
                    {sanitizeTextForPdf(`${locNum} — ${locLabel}`)}
                </Text>
                {locDescription ? (
                    <Text style={styles.locationHeaderDescription}>
                        {sanitizeTextForPdf(`Obs: ${locDescription}`)}
                    </Text>
                ) : null}
            </View>
        );

        if (locPhotoList.length > 0) {
            const firstLocationFigureNumber = nextFigureNumber;
            nextFigureNumber += locPhotoList.length;
            pushPdfPage(
                `${locId}-loc-photos`,
                <View style={styles.locationBlock}>
                    {locationHeader}
                    <View style={styles.locationPhotosBlock}>
                        <SceneImagesGrid
                            images={locPhotoList}
                            figureLabelFor={(_image, index) => `Figura ${firstLocationFigureNumber + index} -`}
                            pdfImagePublicBase={pdfImagePublicBase}
                            pdfEmbeddedImages={pdfEmbeddedImages}
                            figurePageCollector={figurePageCollector}
                            lead={
                                <Text
                                    style={styles.locationPhotosTitle}
                                    minPresenceAhead={SCENE_TITLE_KEEP_WITH_NEXT_PT}
                                >
                                    FOTOS DO LOCAL
                                </Text>
                            }
                        />
                    </View>
                </View>,
                { breakBefore: hasPrintedDetailBlock }
            );
            hasPrintedDetailBlock = true;
        }

        for (const [secIdx, sec] of sections.entries()) {
            const secNum = `${locNum}.${secIdx + 1}`;
            const secLabel = singleLinePdfLabel(sec.name).toUpperCase();
            const laborCols = showCosts && sectionWantsLaborSplitOnPrint(sec);
            const sceneList = filterSceneImages(sec.images);
            const secId = String(sec.id ?? `sec-${secIdx}`);
            const sectionDescription = renderSectionDescription(sec.description, `${locId}-${secId}`);
            const sectionTitleLead = (
                <View
                    style={styles.sectionHeaderWrap}
                    minPresenceAhead={
                        sceneList.length > 0
                            ? SCENE_TITLE_KEEP_WITH_NEXT_PT
                            : SECTION_TABLE_TITLE_KEEP_WITH_NEXT_PT
                    }
                >
                    <Text style={styles.sectionHeaderText}>
                        {sanitizeTextForPdf(`${secNum} — ${secLabel}`)}
                    </Text>
                    {sectionDescription}
                </View>
            );

            const sectionBreakBefore = hasPrintedDetailBlock;

            if (sceneList.length > 0) {
                const hasItems = (sec.items?.length ?? 0) > 0;
                const firstSectionFigureNumber = nextFigureNumber;
                nextFigureNumber += sceneList.length;
                pushFlowBlock(
                    `${locId}-${secId}-content`,
                    <View
                        style={[styles.sectionBlock, styles.sectionPageBlock]}
                        minPresenceAhead={SCENE_TITLE_KEEP_WITH_NEXT_PT}
                    >
                        <SceneImagesGrid
                            images={sceneList}
                            figureLabelFor={(_image, index) => `Figura ${firstSectionFigureNumber + index} -`}
                            pdfImagePublicBase={pdfImagePublicBase}
                            pdfEmbeddedImages={pdfEmbeddedImages}
                            figurePageCollector={figurePageCollector}
                            lead={sectionTitleLead}
                        />
                        {hasItems ? (
                            <SectionItemsTable
                                sec={sec}
                                showCosts={showCosts}
                                laborCols={laborCols}
                                costsDisplayMode={costsDisplayMode}
                                itemFinalValue={itemFinalValue}
                            />
                        ) : null}
                    </View>,
                    { breakBefore: sectionBreakBefore }
                );
            } else {
                pushFlowBlock(
                    `${locId}-${secId}-content`,
                    <View
                        style={styles.sectionBlock}
                        minPresenceAhead={SECTION_TABLE_TITLE_KEEP_WITH_NEXT_PT}
                    >
                        {sectionTitleLead}
                        <SectionItemsTable
                            sec={sec}
                            showCosts={showCosts}
                            laborCols={laborCols}
                            costsDisplayMode={costsDisplayMode}
                            itemFinalValue={itemFinalValue}
                        />
                    </View>,
                    { breakBefore: sectionBreakBefore }
                );
            }
            hasPrintedDetailBlock = true;
        }

        if (sections.length === 0) {
            pushPdfPage(
                `${locId}-empty`,
                <View style={styles.locationBlock}>
                    {!locHasPhotos ? locationHeader : null}
                    <View style={{ marginTop: 2, marginBottom: 6 }}>
                        <Text style={[styles.textSmall, { color: '#6b7280' }]}>
                            Sem trechos neste local
                        </Text>
                    </View>
                </View>,
                { breakBefore: hasPrintedDetailBlock && !locHasPhotos }
            );
            hasPrintedDetailBlock = true;
        } else if (showCosts && costsDisplayMode === 'location') {
            pushPdfPage(
                `${locId}-subtotal`,
                <View style={styles.subtotalRow}>
                    <Text style={[styles.textSmall, styles.textBold]}>
                        Total local: {formatMoney(locationTotal)}
                    </Text>
                </View>
            );
        }
    }

    return <View>{pdfPages}</View>;
}

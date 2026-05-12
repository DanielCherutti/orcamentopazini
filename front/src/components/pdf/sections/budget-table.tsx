
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
import { sanitizeTextForPdf } from '@/lib/pdf/sanitize-pdf-text';

const styles = StyleSheet.create({
    locationBlock: {
        marginBottom: 20
    },
    locationHeader: {
        marginTop: 20,
        marginBottom: 10,
        paddingBottom: 5,
    },
    locationHeaderText: {
        fontSize: 16,
        fontFamily: theme.fonts.bold,
        color: theme.colors.primary,
        lineHeight: 20,
    },
    locationHeaderDivider: {
        marginTop: 2,
        height: 1.5,
        backgroundColor: theme.colors.primary,
    },
    sectionBlock: {
        marginBottom: 15,
        paddingLeft: 0
    },
    sectionTitle: {
        fontSize: 12,
        fontFamily: theme.fonts.bold,
        color: theme.colors.secondary,
        marginBottom: 5,
        backgroundColor: theme.colors.bgHeader,
        padding: 4
    },
    /** Bloco não fracionável para manter título + imagem juntos na troca de página. */
    sectionLead: {
        marginBottom: 6,
    },
    /** Quadro visual fixo: evita imagem virar "faixa" para caber no fim da página. */
    sceneImage: {
        width: 525,
        height: 300,
        alignSelf: 'center',
        marginBottom: 10,
        objectFit: 'contain',
    },
    table: {
        marginTop: 5,
        width: '100%'
    },
    tableHeader: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        paddingVertical: 4,
        backgroundColor: theme.colors.bgLight
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 0.5,
        borderBottomColor: theme.colors.border,
        paddingVertical: 6,
        alignItems: 'center'
    },
    colDesc: { flex: 25, paddingRight: 5 },
    colQty: { flex: 5, textAlign: 'center' },
    colMoney: { flex: 7, textAlign: 'right' },
    colTotal: { flex: 10, textAlign: 'right' },
    subtotalRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingTop: 5,
    },

    textSmall: { fontSize: 9, color: theme.colors.text },
    textBold: { fontFamily: theme.fonts.bold, color: theme.colors.text }
});

const formatMoney = (val: number) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return '—';
    const safe = Math.min(Math.max(n, -1e15), 1e15);
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safe);
};

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

function itemLabel(item: BudgetItem): string {
    if (typeof item.product_id === 'object' && item.product_id) {
        return item.product_id.description || item.product_id.name || 'Produto';
    }
    return item.product_name || 'Produto';
}

function sectionWantsLaborSplitOnPrint(sec: { items?: BudgetItem[] }): boolean {
    const items = sec.items ?? [];
    return items.some((item) => {
        const r = item as unknown as Record<string, unknown>;
        return Number(item.labor_cost ?? 0) > 0 && Boolean(r.labor_show_on_print);
    });
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
            <Text style={[styles.textSmall, styles.textBold, styles.colDesc]}>DESCRIÇÃO</Text>
            <Text style={[styles.textSmall, styles.textBold, styles.colQty]}>QTD</Text>
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

function SectionSceneImages({
    images,
    mode,
    pdfImagePublicBase,
    pdfEmbeddedImages,
    figurePageCollector,
}: {
    images: NonNullable<BudgetLocation["sections"]>[number]["images"];
    mode: 'first' | 'rest' | 'all';
    pdfImagePublicBase?: string;
    pdfEmbeddedImages?: PdfEmbeddedImages;
    figurePageCollector?: { segmentStartPages: Record<string, number> };
}) {
    const fullList = (images ?? []).filter((img) => !!(img?.composed_url || img?.url));
    const list =
        mode === 'first'
            ? fullList.slice(0, 1)
            : mode === 'rest'
                ? fullList.slice(1)
                : fullList;
    if (!list.length) return null;

    return (
        <>
            {list.map((sceneImg, imgIdx) => (
                <View key={sceneImg?.id ?? `img-${imgIdx}`} wrap={false}>
                    <SectionSceneImage
                        sceneImg={sceneImg}
                        imageKey={sceneImg?.id ?? `img-${imgIdx}`}
                        pdfImagePublicBase={pdfImagePublicBase}
                        pdfEmbeddedImages={pdfEmbeddedImages}
                        figurePageCollector={figurePageCollector}
                    />
                </View>
            ))}
        </>
    );
}

function SectionSceneImage({
    sceneImg,
    imageKey,
    pdfImagePublicBase,
    pdfEmbeddedImages,
    figurePageCollector,
}: {
    sceneImg: BudgetImage;
    imageKey: string;
    pdfImagePublicBase?: string;
    pdfEmbeddedImages?: PdfEmbeddedImages;
    figurePageCollector?: { segmentStartPages: Record<string, number> };
}) {
    const raw = sceneImg?.url || sceneImg?.composed_url;
    if (!raw) return null;
    const src = proxyPdfImageSrc(raw, pdfImagePublicBase, pdfEmbeddedImages) ?? raw;
    const figureId = sceneImg?.id ? String(sceneImg.id) : undefined;

    return (
        <View key={imageKey}>
            {figurePageCollector && figureId ? (
                <View
                    /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- `render` não tipado no react-pdf */
                    render={({ pageNumber }: { pageNumber: number }) => {
                        const key = `figure:${figureId}`;
                        const prev = figurePageCollector.segmentStartPages[key];
                        if (!Number.isFinite(prev) || pageNumber < prev) {
                            figurePageCollector.segmentStartPages[key] = pageNumber;
                        }
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
                        const prev = figurePageCollector.segmentStartPages[key];
                        if (!Number.isFinite(prev) || pageNumber < prev) {
                            figurePageCollector.segmentStartPages[key] = pageNumber;
                        }
                        return "";
                    }}
                />
            ) : null}
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
            <Image src={src} style={styles.sceneImage} />
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

export const BudgetTable = ({
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
}) => (
    <View>
        {locations.map((loc, locIdx) => {
            const locNum = `${sectionNumber}.${locIdx + 1}`;
            const sections = loc.sections ?? [];
            const { itemFinalValue } = computeLocationItemValues(loc);
            const locationTotal = sections.reduce((sum, sec) => {
                const sectionTotal = (sec.items ?? []).reduce((acc, item) => {
                    if (!item.id) return acc;
                    return acc + Number(itemFinalValue.get(String(item.id)) ?? 0);
                }, 0);
                return sum + sectionTotal;
            }, 0);
            return (
            <View key={loc.id} style={styles.locationBlock}>
                {sections.length === 0 ? (
                    <View style={styles.locationHeader}>
                        <Text style={styles.locationHeaderText}>
                            {sanitizeTextForPdf(`${locNum} — ${loc.name ?? ''}`)}
                        </Text>
                        <View style={styles.locationHeaderDivider} />
                    </View>
                ) : null}

                {sections.map((sec, secIdx) => {
                    const secNum = `${locNum}.${secIdx + 1}`;
                    const laborCols = showCosts && sectionWantsLaborSplitOnPrint(sec);
                    const hasSceneImages = (sec.images ?? []).some(
                        (img) => !!(img?.composed_url || img?.url)
                    );
                    return (
                    <View key={sec.id} style={styles.sectionBlock}>
                        <View style={styles.sectionLead} wrap={false}>
                            {secIdx === 0 ? (
                                <View style={styles.locationHeader}>
                                    <Text style={styles.locationHeaderText}>
                                        {sanitizeTextForPdf(`${locNum} — ${loc.name ?? ''}`)}
                                    </Text>
                                    <View style={styles.locationHeaderDivider} />
                                </View>
                            ) : null}
                            <Text style={styles.sectionTitle}>
                                {sanitizeTextForPdf(`${secNum} — ${(sec.name ?? '').toUpperCase()}`)}
                            </Text>
                            {/* Título + primeira cena no mesmo bloco (evita título órfão). */}
                            <SectionSceneImages
                                images={sec.images}
                                mode="first"
                                pdfImagePublicBase={pdfImagePublicBase}
                                pdfEmbeddedImages={pdfEmbeddedImages}
                                figurePageCollector={figurePageCollector}
                            />
                            {/* Sem cenas: mantém cabeçalho da tabela com o título (evita título só na virada). */}
                            {!hasSceneImages ? (
                                <SectionTableHeader showCosts={showCosts} laborCols={laborCols} />
                            ) : null}
                        </View>
                        {hasSceneImages ? (
                            <SectionSceneImages
                                images={sec.images}
                                mode="rest"
                                pdfImagePublicBase={pdfImagePublicBase}
                                pdfEmbeddedImages={pdfEmbeddedImages}
                                figurePageCollector={figurePageCollector}
                            />
                        ) : null}

                        {/* Lista de Itens */}
                        <View style={styles.table}>
                            {hasSceneImages ? (
                                <SectionTableHeader showCosts={showCosts} laborCols={laborCols} />
                            ) : null}

                            {/* Rows */}
                            {(sec.items || []).map((item, idx) => {
                                const finalVal = Number(itemFinalValue.get(String(item.id)) ?? 0);
                                const cells = pdfItemValueCells(item, finalVal, laborCols);
                                return (
                                <View key={item.id} style={[styles.tableRow, { backgroundColor: idx % 2 === 0 ? 'white' : theme.colors.bgLight }]}>
                                    <Text style={[styles.textSmall, styles.colDesc]}>
                                        {sanitizeTextForPdf(
                                            [
                                                itemLabel(item),
                                                Boolean(
                                                    (item as unknown as Record<string, unknown>)
                                                        .observation_show_on_print
                                                ) &&
                                                    String(
                                                        (item as unknown as Record<string, unknown>)
                                                            .observation_text ?? ''
                                                    ).trim()
                                                    ? ` - Obs: ${String(
                                                          (item as unknown as Record<string, unknown>)
                                                              .observation_text ?? ''
                                                      ).trim()}`
                                                    : '',
                                            ]
                                                .filter(Boolean)
                                                .join('')
                                        )}
                                    </Text>
                                    <Text style={[styles.textSmall, styles.colQty]}>
                                        {sanitizeTextForPdf(String(item.quantity ?? ''))}
                                    </Text>
                                    {showCosts && laborCols ? (
                                        <>
                                            <Text style={[styles.textSmall, styles.colMoney]}>{cells.equip}</Text>
                                            <Text style={[styles.textSmall, styles.colMoney]}>{cells.mo}</Text>
                                            <Text style={[styles.textSmall, styles.colTotal]}>{cells.total}</Text>
                                        </>
                                    ) : showCosts ? (
                                        <Text style={[styles.textSmall, styles.colTotal]}>
                                            {formatMoney(finalVal)}
                                        </Text>
                                    ) : null}
                                </View>
                            );
                            })}

                            {showCosts && costsDisplayMode === 'section' ? (
                                <View style={styles.subtotalRow}>
                                    <Text style={[styles.textSmall, styles.textBold]}>
                                        Total trecho: {formatMoney((sec.items ?? []).reduce((sum, item) => sum + Number(itemFinalValue.get(String(item.id)) ?? 0), 0))}
                                    </Text>
                                </View>
                            ) : null}
                        </View>
                    </View>
                    );
                })}
                {showCosts && costsDisplayMode === 'location' ? (
                    <View style={styles.subtotalRow}>
                        <Text style={[styles.textSmall, styles.textBold]}>
                            Total local: {formatMoney(locationTotal)}
                        </Text>
                    </View>
                ) : null}
            </View>
            );
        })}
        {showCosts && costsDisplayMode === 'general' ? (
            <View style={[styles.subtotalRow, { marginTop: 8 }]}>
                <Text style={[styles.textSmall, styles.textBold]}>
                    Total geral: {formatMoney(
                        locations.reduce((sum, loc) => {
                            const { itemFinalValue } = computeLocationItemValues(loc);
                            const locationTotal = (loc.sections ?? []).reduce((secSum, sec) => {
                                return (
                                    secSum +
                                    (sec.items ?? []).reduce(
                                        (itemSum, item) =>
                                            itemSum + Number(itemFinalValue.get(String(item.id)) ?? 0),
                                        0
                                    )
                                );
                            }, 0);
                            return sum + locationTotal;
                        }, 0)
                    )}
                </Text>
            </View>
        ) : null}
    </View>
);

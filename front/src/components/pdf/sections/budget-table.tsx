
import React from 'react';
import { Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { theme } from '../theme';
import { BudgetItem, BudgetLocation } from '@/types/budget-types';
import {
    computeItemAdjustmentValue,
    computeItemSubtotal,
    computeLocationAssemblyTotal,
    distributeProportional,
    type CostDisplayMode,
    type LocationAssemblyMode,
} from '@/lib/budgets/scope-pricing';

const styles = StyleSheet.create({
    locationBlock: {
        marginBottom: 20
    },
    locationHeader: {
        fontSize: 16,
        fontFamily: theme.fonts.bold,
        color: theme.colors.primary,
        paddingBottom: 5,
        marginBottom: 10,
        borderBottomWidth: 1.5,
        borderBottomColor: theme.colors.primary,
        marginTop: 20
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
    sceneImage: {
        width: '100%',
        height: 250,
        objectFit: 'contain',
        marginBottom: 10,
        borderRadius: 2
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
    colDesc: { flex: 5, paddingRight: 5 },
    colQty: { flex: 1, textAlign: 'center' },
    colMoney: { flex: 1.4, textAlign: 'right' },
    colTotal: { flex: 2, textAlign: 'right' },
    subtotalRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingTop: 5,
    },

    textSmall: { fontSize: 9, color: theme.colors.text },
    textBold: { fontFamily: theme.fonts.bold, color: theme.colors.text }
});

const formatMoney = (val: number) =>
    new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

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
}: {
    locations: BudgetLocation[];
    sectionNumber?: number;
    showCosts?: boolean;
    costsDisplayMode?: CostDisplayMode;
}) => (
    <View>
        {locations.map((loc, locIdx) => {
            const locNum = `${sectionNumber}.${locIdx + 1}`;
            const { itemFinalValue } = computeLocationItemValues(loc);
            const locationTotal = (loc.sections ?? []).reduce((sum, sec) => {
                const sectionTotal = (sec.items ?? []).reduce((acc, item) => {
                    if (!item.id) return acc;
                    return acc + Number(itemFinalValue.get(String(item.id)) ?? 0);
                }, 0);
                return sum + sectionTotal;
            }, 0);
            return (
            <View key={loc.id} style={styles.locationBlock} break={false} wrap={false}>
                <Text style={styles.locationHeader}>{locNum} — {loc.name}</Text>

                {(loc.sections || []).map((sec, secIdx) => {
                    const secNum = `${locNum}.${secIdx + 1}`;
                    const laborCols = showCosts && sectionWantsLaborSplitOnPrint(sec);
                    return (
                    <View key={sec.id} style={styles.sectionBlock} wrap={false}>
                        <Text style={styles.sectionTitle}>{secNum} — {sec.name.toUpperCase()}</Text>

                        {/* Cena Composta */}
                        {(sec.images || [])[0] && (sec.images![0].composed_url || sec.images![0].url) && (
                            /* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */
                            <Image
                                src={(sec.images![0].composed_url || sec.images![0].url)}
                                style={styles.sceneImage}
                            />
                        )}

                        {/* Lista de Itens */}
                        <View style={styles.table}>
                            {/* Header */}
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

                            {/* Rows */}
                            {(sec.items || []).map((item, idx) => {
                                const finalVal = Number(itemFinalValue.get(String(item.id)) ?? 0);
                                const cells = pdfItemValueCells(item, finalVal, laborCols);
                                return (
                                <View key={item.id} style={[styles.tableRow, { backgroundColor: idx % 2 === 0 ? 'white' : theme.colors.bgLight }]}>
                                    <Text style={[styles.textSmall, styles.colDesc]}>
                                        {itemLabel(item)}
                                        {Boolean(
                                            (item as unknown as Record<string, unknown>).observation_show_on_print
                                        ) &&
                                        String(
                                            (item as unknown as Record<string, unknown>).observation_text ?? ''
                                        ).trim()
                                            ? ` - Obs: ${String(
                                                  (item as unknown as Record<string, unknown>).observation_text ?? ''
                                              ).trim()}`
                                            : ''}
                                    </Text>
                                    <Text style={[styles.textSmall, styles.colQty]}>{item.quantity}</Text>
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

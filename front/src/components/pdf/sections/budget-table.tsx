
import React from 'react';
import { Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { theme } from '../theme';
import { BudgetLocation } from '@/types/budget-types';

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
    colTotal: { flex: 2, textAlign: 'right' },

    textSmall: { fontSize: 9, color: theme.colors.text },
    textBold: { fontFamily: theme.fonts.bold, color: theme.colors.text }
});

const formatMoney = (val: number) =>
    new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

export const BudgetTable = ({ locations, sectionNumber = 1 }: { locations: BudgetLocation[]; sectionNumber?: number }) => (
    <View>
        {locations.map((loc, locIdx) => {
            const locNum = `${sectionNumber}.${locIdx + 1}`;
            return (
            <View key={loc.id} style={styles.locationBlock} break={false} wrap={false}>
                <Text style={styles.locationHeader}>{locNum} — {loc.name}</Text>

                {(loc.sections || []).map((sec, secIdx) => {
                    const secNum = `${locNum}.${secIdx + 1}`;
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
                                <Text style={[styles.textSmall, styles.textBold, styles.colTotal]}>VALOR (R$)</Text>
                            </View>

                            {/* Rows */}
                            {(sec.items || []).map((item, idx) => (
                                <View key={item.id} style={[styles.tableRow, { backgroundColor: idx % 2 === 0 ? 'white' : theme.colors.bgLight }]}>
                                    <Text style={[styles.textSmall, styles.colDesc]}>
                                        {typeof item.product_id === "object" ? item.product_id.description || "Produto" : "Produto"}
                                    </Text>
                                    <Text style={[styles.textSmall, styles.colQty]}>{item.quantity}</Text>
                                    <Text style={[styles.textSmall, styles.colTotal]}>
                                        {formatMoney(item.total)}
                                    </Text>
                                </View>
                            ))}

                            {/* Subtotal Trecho (Optional) */}
                            {/* <View style={{flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 4}}>
                                <Text style={[styles.textSmall, styles.textBold]}>Total Trecho: {formatMoney(sec.items?.reduce((a,b) => a + b.total, 0) || 0)}</Text>
                            </View> */}
                        </View>
                    </View>
                    );
                })}
            </View>
            );
        })}
    </View>
);

import React from "react";
import { Document, Image, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { hierarchicalInstallationNumber } from "@/lib/databooks/domain";
import type { Databook, DatabookInstallation, DatabookMedia, TechnicalTableCell } from "@/types/databook-types";
import type { ProposalSettings } from "@/actions/settings-actions";
import type { Budget } from "@/types/budget-types";
import type { CompositorPdfPayload } from "@/components/pdf/compositor-pdf-types";
import { CompositorCoverPdfPage } from "@/components/pdf/sections/compositor-cover-pdf";
import { PdfInnerPage } from "@/components/pdf/pdf-inner-page";
import { buildPdfInnerPageCommonProps, resolvePdfCompositorShell } from "@/lib/pdf/pdf-compositor-document-shell";

const styles = StyleSheet.create({
    page: { paddingTop: 48, paddingBottom: 42, paddingHorizontal: 66, fontSize: 9, color: "#315b9b" },
    cover: { padding: 60, justifyContent: "center", alignItems: "center", textAlign: "center" },
    coverTitle: { fontSize: 28, fontWeight: 700, color: "#1e4965", marginBottom: 18 },
    coverCode: { fontSize: 12, marginBottom: 8 },
    header: { position: "absolute", top: 22, left: 42, right: 42, height: 34, borderBottomWidth: 1, borderBottomColor: "#1e4965", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    footer: { position: "absolute", bottom: 20, left: 42, right: 42, borderTopWidth: 1, borderTopColor: "#bbc5cc", paddingTop: 6, flexDirection: "row", justifyContent: "space-between", color: "#5e6b73", fontSize: 8 },
    title: { fontSize: 17, fontWeight: 700, color: "#1e4965", marginBottom: 16 },
    subtitle: { fontSize: 11, fontWeight: 700, marginBottom: 8, marginTop: 12 },
    paragraph: { fontSize: 9, lineHeight: 1.5, marginBottom: 8 },
    tocRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 8 },
    tocNumber: { width: 42, fontSize: 10, fontWeight: 700 },
    tocTitle: { fontSize: 10, flexShrink: 1 },
    tocDots: { flexGrow: 1, minWidth: 24, borderBottomWidth: 0.6, borderBottomColor: "#4b5563", marginHorizontal: 6, marginBottom: 3 },
    tocPage: { width: 28, textAlign: "right", fontSize: 10, fontWeight: 700 },
    tocParent: { fontWeight: 700, textTransform: "uppercase" },
    indexLink: { color: "#1f2937", textDecoration: "none" },
    productInstallationName: { borderTopWidth: 1, borderTopColor: "#315b9b", paddingTop: 3, fontSize: 7, fontWeight: 700, color: "#315b9b", textTransform: "uppercase" },
    productTitle: { textAlign: "center", fontSize: 18, fontWeight: 700, color: "#315b9b", marginTop: 5, marginBottom: 11 },
    table: { borderBottomWidth: 0.7, borderBottomColor: "#315b9b" },
    tableRow: { flexDirection: "row", minHeight: 14, alignItems: "stretch" },
    tableRowTint: { backgroundColor: "#dce4f2" },
    tableCell: { paddingHorizontal: 6, paddingVertical: 2, justifyContent: "center", color: "#315b9b", fontSize: 8 },
    tableLabel: { fontWeight: 700 },
    tableValue: { fontStyle: "italic" },
    tableSectionTitle: { backgroundColor: "#dce4f2", paddingVertical: 3, textAlign: "center", fontSize: 9, fontWeight: 700, color: "#315b9b" },
    tableLongText: { backgroundColor: "#dce4f2", paddingHorizontal: 7, paddingTop: 3, paddingBottom: 5, fontSize: 8, lineHeight: 1.35, fontStyle: "italic", color: "#315b9b" },
    productFigures: { marginTop: 18, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "flex-start" },
    productFigureItem: { alignItems: "center", paddingHorizontal: 2, marginBottom: 7 },
    productFigure: { width: "100%", objectFit: "contain" },
    productFigureCaption: { textAlign: "center", fontSize: 6.5, fontStyle: "italic", color: "#315b9b", marginTop: 3 },
    installationTables: { width: "86%", alignSelf: "center" },
    figure: { width: "100%", height: 380, objectFit: "contain", marginTop: 16 },
    caption: { textAlign: "center", fontSize: 8, color: "#5e6b73", marginTop: 6 },
    installationKicker: { borderTopWidth: 1, borderTopColor: "#315b9b", paddingTop: 3, fontSize: 11, fontWeight: 700, color: "#315b9b", textTransform: "uppercase", marginBottom: 5 },
    installationTitle: { textAlign: "center", fontSize: 22, fontWeight: 700, color: "#315b9b", marginBottom: 20 },
    infoRow: { flexDirection: "row", minHeight: 20, backgroundColor: "#dce4f2", paddingHorizontal: 7, paddingVertical: 3 },
    infoRowClear: { backgroundColor: "#ffffff" },
    infoLabel: { width: "36%", fontSize: 11, fontWeight: 700, color: "#315b9b" },
    infoValue: { width: "64%", fontSize: 11, color: "#315b9b" },
    sectionBand: { marginTop: 1, backgroundColor: "#dce4f2", paddingVertical: 4, textAlign: "center", fontSize: 12, fontWeight: 700, color: "#315b9b" },
    observations: { color: "#315b9b", fontSize: 11, lineHeight: 1.35, paddingHorizontal: 7, paddingTop: 5 },
    equipmentBand: { marginTop: 38, backgroundColor: "#dce4f2", paddingVertical: 5, textAlign: "center", fontSize: 13, fontWeight: 700, color: "#315b9b", textTransform: "uppercase" },
    equipmentHeader: { flexDirection: "row", paddingHorizontal: 7, paddingVertical: 4, color: "#315b9b", fontWeight: 700, fontSize: 11 },
    equipmentRow: { flexDirection: "row", minHeight: 22, backgroundColor: "#dce4f2", paddingHorizontal: 7, paddingVertical: 4, color: "#315b9b", fontSize: 11 },
    equipmentRowClear: { backgroundColor: "#ffffff" },
    equipmentQuantity: { width: "17%", textAlign: "center", fontWeight: 700 },
    equipmentDescription: { width: "83%" },
    equipmentTableEnd: { borderBottomWidth: 0.8, borderBottomColor: "#315b9b" },
    installationFigureBlock: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "flex-start" },
    installationFigureItem: { alignItems: "center", paddingHorizontal: 2, marginBottom: 5 },
    installationFigure: { width: "100%", objectFit: "contain" },
    installationFigureCaption: { textAlign: "center", fontSize: 7, fontStyle: "italic", color: "#315b9b", marginTop: 5 },
});

export type DatabookPagination = { segmentStartPages: Record<string, number> };

function recordPaginationPage(collector: DatabookPagination, probeKey: string, pageNumber: number) {
    const previous = collector.segmentStartPages[probeKey];
    if (!previous || pageNumber < previous) collector.segmentStartPages[probeKey] = pageNumber;
}

function PaginationProbe({ collector, probeKey }: { collector?: DatabookPagination; probeKey: string }) {
    if (!collector) return null;
    return <Text
        fixed
        style={{ position: "absolute", opacity: 0, fontSize: 1, left: 0, top: 0 }}
        render={({ pageNumber }) => {
            recordPaginationPage(collector, probeKey, pageNumber);
            return "";
        }}
    />;
}

function pdfAnchor(prefix: string, id: string) {
    return `${prefix}-${id.replace(/[^a-z0-9_-]+/gi, "-")}`;
}

function IndexRow({ number, title, page, target, depth = 0, parent = false }: { number?: string; title: string; page: number; target: string; depth?: number; parent?: boolean }) {
    const row = <View style={[styles.tocRow, { paddingLeft: depth * 14 }]}>
        {number ? <Text style={styles.tocNumber}>{number}</Text> : null}
        <Text style={[styles.tocTitle, parent ? styles.tocParent : {}]}>{title}</Text>
        <View style={styles.tocDots} />
        <Text style={styles.tocPage}>{page}</Text>
    </View>;
    return <Link src={`#${target}`} style={styles.indexLink}>{row}</Link>;
}

function formatInspectionDate(value?: string) {
    if (!value) return "—";
    const parts = value.slice(0, 10).split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
}

function valueForCell(cell: TechnicalTableCell, values: Record<string, string | number | boolean | null>, product: Record<string, unknown>, manual?: Record<string, unknown> | null) {
    if (cell.kind === "label") return cell.label ?? "";
    if (cell.kind === "fixed") return String(cell.defaultValue ?? cell.label ?? "");
    if (cell.key && values[cell.key] != null) {
        const value = values[cell.key];
        return typeof value === "boolean" ? (value ? "Sim" : "Não") : String(value);
    }
    if (cell.variable === "produto.descricao") return String(product.description ?? "");
    if (cell.variable === "produto.fabricante") return String(product.manufacturer ?? "");
    if (cell.variable === "manual.referencia") return String(manual?.reference ?? "Não informado");
    return String(cell.defaultValue ?? "");
}

function TechnicalTable({ item }: { item: DatabookInstallation["products"][number] }) {
    const schema = item.table_schema_snapshot;
    const weights = schema.columns.map((column) => Math.max(20, column.width ?? 180));
    const total = weights.reduce((sum, width) => sum + width, 0);
    const values = {
        ...item.table_values,
        ...(item.structural_evaluation && item.table_values.structural_evaluation == null
            ? { structural_evaluation: item.structural_evaluation }
            : {}),
        ...(item.general_observations && item.table_values.general_observations == null
            ? { general_observations: item.general_observations }
            : {}),
    };
    return (
        <View style={[styles.table, { width: `${schema.tableWidthPercent ?? 82}%`, alignSelf: "center" }]}>
            {Array.from({ length: schema.rows }, (_, rowIndex) => {
                const rowCells = schema.cells
                    .filter((cell) => cell.row === rowIndex)
                    .sort((a, b) => a.column - b.column);
                if (!rowCells.length) return null;
                const rowLabel = rowCells.find((cell) => cell.kind === "label")?.label?.trim().toLocaleLowerCase("pt-BR") ?? "";
                const isObservationsRow = rowLabel.includes("observa");
                if (isObservationsRow) {
                    const contentCell = rowCells.find((cell) => cell.kind !== "label");
                    const content = contentCell
                        ? valueForCell(contentCell, values, item.product_snapshot, item.manual_reference_snapshot)
                        : "";
                    return <View key={rowIndex}>
                        <Text style={styles.tableSectionTitle}>{rowCells.find((cell) => cell.kind === "label")?.label ?? "Observações Gerais"}</Text>
                        <Text style={styles.tableLongText}>{content || "—"}</Text>
                    </View>;
                }
                return (
                    <View key={rowIndex} style={[styles.tableRow, rowIndex % 2 === 0 ? styles.tableRowTint : {}]}>
                        {rowCells.map((cell) => {
                            const width = weights
                                .slice(cell.column, cell.column + (cell.columnSpan ?? 1))
                                .reduce((sum, value) => sum + value, 0);
                            const value = valueForCell(cell, values, item.product_snapshot, item.manual_reference_snapshot);
                            return (
                                <View
                                    key={cell.id}
                                    style={[
                                        styles.tableCell,
                                        cell.kind === "label" ? styles.tableLabel : {},
                                        cell.kind !== "label" ? styles.tableValue : {},
                                        cell.style?.background ? { backgroundColor: cell.style.background } : {},
                                        cell.style?.align ? { alignItems: cell.style.align === "center" ? "center" : cell.style.align === "right" ? "flex-end" : "flex-start" } : {},
                                        { width: `${(width / total) * 100}%` },
                                    ]}
                                >
                                    <Text style={[
                                        cell.style?.bold ? { fontWeight: 700 } : {},
                                        cell.style?.italic ? { fontStyle: "italic" } : {},
                                        cell.style?.align ? { textAlign: cell.style.align } : {},
                                    ]}>{value || "—"}</Text>
                                </View>
                            );
                        })}
                    </View>
                );
            })}
        </View>
    );
}

export function DatabookPdfDocument({ book, installations, media = [], settings, budget, compositorPdf, paginationCollector, resolvedPagination }: { book: Databook; installations: DatabookInstallation[]; media?: DatabookMedia[]; settings?: ProposalSettings; budget?: Budget; compositorPdf?: CompositorPdfPayload; paginationCollector?: DatabookPagination; resolvedPagination?: DatabookPagination }) {
    const figures = media.filter((item) => item.include_in_figure_list);
    const resolvedPages = resolvedPagination?.segmentStartPages ?? {};
    const pageFor = (key: string) => resolvedPages[key] ?? 1;
    const toc = installations.flatMap((installation, installationIndex) => {
        const entries = [{
            key: `installation:${installation.id}`,
            target: pdfAnchor("installation", installation.id),
            number: `${installationIndex + 1}.`,
            title: installation.name,
            page: pageFor(`installation:${installation.id}`),
            depth: 0,
            parent: true,
        }];
        installation.products.forEach((item, productIndex) => entries.push({
            key: `product:${item.id}`,
            target: pdfAnchor("product", item.id),
            number: `${hierarchicalInstallationNumber(installationIndex, productIndex, item.suffix)}.`,
            title: item.title,
            page: pageFor(`product:${item.id}`),
            depth: 1,
            parent: false,
        }));
        return entries;
    });
    const figurePage = (id: string) => pageFor(`figure:${id}`);
    const innerPageCommon = settings && budget
        ? buildPdfInnerPageCommonProps(resolvePdfCompositorShell(compositorPdf, settings), settings, budget)
        : null;
    const internalPage = (pageKey: string, title: string, children: React.ReactNode, wrap = true) =>
        innerPageCommon ? <PdfInnerPage key={pageKey} pageKey={pageKey} title={title} wrap={wrap} {...innerPageCommon}>{children}</PdfInnerPage>
            : <Page key={pageKey} size="A4" orientation="portrait" style={styles.page} wrap={wrap}>{title ? <Text style={styles.title}>{title}</Text> : null}{children}</Page>;
    const renderFigurePage = (figure: DatabookMedia, index: number) => figure.embedded_src ? internalPage(`figure-page-${figure.id}`, "", <>
        <View id={pdfAnchor("figure", figure.id)} />
        <PaginationProbe collector={paginationCollector} probeKey={`figure:${figure.id}`} />
        <Text style={styles.title}>Figura {index + 1}</Text>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image não possui prop alt */}
        <Image src={figure.embedded_src} style={styles.figure} />
        <Text style={styles.caption}>Figura {index + 1} — {figure.caption || figure.filename}</Text>
    </>) : null;
    return (
        <Document title={`DataBook — ${book.title}`} author="Pazini">
            {settings && budget ? <CompositorCoverPdfPage
                budget={budget}
                settings={settings}
                coverProps={resolvePdfCompositorShell(compositorPdf, settings).compositorCoverMerged}
                headerFooterProps={resolvePdfCompositorShell(compositorPdf, settings).headerFooterProps}
            /> : <Page size="A4" orientation="portrait" style={styles.cover}>
                <Text style={styles.coverTitle}>DATABOOK</Text><Text style={styles.coverCode}>{book.code}</Text>
                <Text style={{ fontSize: 18, marginBottom: 30 }}>{book.title}</Text>
                <Text>{book.project_name || book.worksite_name || ""}</Text><Text>{book.location || ""}</Text>
                <Text style={{ marginTop: 24 }}>ART: {book.art_number || "—"} · Revisão: {book.revision || "0"}</Text>
            </Page>}
            {settings && budget ? <PdfInnerPage pageKey="databook-toc" title="Sumário" {...buildPdfInnerPageCommonProps(resolvePdfCompositorShell(compositorPdf, settings), settings, budget)}>{toc.map((entry) => <IndexRow key={entry.key} number={entry.number} title={entry.title} page={entry.page} target={entry.target} depth={entry.depth} parent={entry.parent} />)}</PdfInnerPage> : <Page size="A4" orientation="portrait" style={styles.page}><Text style={styles.title}>Sumário</Text>{toc.map((entry) => <IndexRow key={entry.key} number={entry.number} title={entry.title} page={entry.page} target={entry.target} depth={entry.depth} parent={entry.parent} />)}</Page>}
            {figures.length ? internalPage("databook-figures", "Lista de figuras", figures.map((figure, index) => <IndexRow key={figure.id} title={`Figura ${index + 1} — ${figure.caption || figure.filename}`} page={figurePage(figure.id)} target={pdfAnchor("figure", figure.id)} />)) : null}
            {installations.flatMap((installation, installationIndex) => {
                const installationFigures = figures.filter((figure) => figure.installation_id === installation.id && !figure.installation_product_id);
                const estimatedObservationLines = Math.max(1, Math.ceil((installation.general_observations?.length ?? 0) / 95));
                const installationFigureColumns = installationFigures.length <= 1 ? 1 : installationFigures.length <= 4 ? 2 : 3;
                const installationFigureRows = Math.ceil(installationFigures.length / installationFigureColumns);
                const installationFigureSpace = Math.max(
                    120,
                    305 - Math.max(0, installation.products.length - 2) * 12 - Math.max(0, estimatedObservationLines - 1) * 8,
                );
                const adaptiveFigureHeight = Math.max(
                    68,
                    Math.min(265, installationFigureSpace / Math.max(1, installationFigureRows)),
                );
                const installationFigureWidth = installationFigureColumns === 1
                    ? "72%"
                    : installationFigureColumns === 2
                        ? "50%"
                        : "33.333%";
                return [
                internalPage(`installation-page-${installation.id}`, "", <>
                    <View id={pdfAnchor("installation", installation.id)} />
                    <PaginationProbe collector={paginationCollector} probeKey={`installation:${installation.id}`} />
                    <Text style={styles.installationKicker}>Identificação da instalação</Text>
                    <Text style={styles.installationTitle}>{installationIndex + 1}. {installation.name.toUpperCase()}</Text>
                    <View style={styles.installationTables}>
                        <View style={styles.infoRow}><Text style={styles.infoLabel}>Instalador Responsável</Text><Text style={styles.infoValue}>{installation.installer_name || book.installer_responsible || "—"}</Text></View>
                        <View style={[styles.infoRow, styles.infoRowClear]}><Text style={styles.infoLabel}>Data da Inspeção</Text><Text style={styles.infoValue}>{formatInspectionDate(installation.inspection_date)}</Text></View>
                        <View style={styles.infoRow}><Text style={styles.infoLabel}>Validade</Text><Text style={styles.infoValue}>{installation.validity || "—"}</Text></View>
                        <View style={[styles.infoRow, styles.infoRowClear]}><Text style={styles.infoLabel}>Inspetor da Instalação</Text><Text style={styles.infoValue}>{installation.inspector_name || book.inspector || "—"}</Text></View>
                        <Text style={styles.sectionBand}>Observações Gerais</Text>
                        <Text style={styles.observations}>{installation.general_observations || installation.description || "—"}</Text>
                        <Text style={styles.equipmentBand}>Lista de equipamentos</Text>
                        <View style={styles.equipmentHeader}><Text style={styles.equipmentQuantity}>Quantidade</Text><Text style={styles.equipmentDescription}>Descrição Equipamento</Text></View>
                        <View style={styles.equipmentTableEnd}>
                            {installation.products.length ? installation.products.map((item, index) => <View key={item.id} style={[styles.equipmentRow, index % 2 === 1 ? styles.equipmentRowClear : {}]}><Text style={styles.equipmentQuantity}>{item.quantity} {item.unit || ""}</Text><Text style={styles.equipmentDescription}>{item.title}</Text></View>) : <View style={styles.equipmentRow}><Text style={styles.equipmentDescription}>Nenhum equipamento adicionado.</Text></View>}
                        </View>
                    </View>
                    {installationFigures.length ? <View style={styles.installationFigureBlock} wrap={false}>
                        {installationFigures.map((figure) => {
                            const figureIndex = figures.findIndex((item) => item.id === figure.id);
                            return figure.embedded_src ? <View key={figure.id} id={pdfAnchor("figure", figure.id)} style={[styles.installationFigureItem, { width: installationFigureWidth }]}>
                                <PaginationProbe collector={paginationCollector} probeKey={`figure:${figure.id}`} />
                                {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image não possui prop alt */}
                                <Image src={figure.embedded_src} style={[styles.installationFigure, { height: adaptiveFigureHeight }]} />
                                <Text style={styles.installationFigureCaption}>Figura {figureIndex + 1} — {figure.caption || figure.filename}</Text>
                            </View> : null;
                        })}
                    </View> : null}
                </>),
                ...installation.products.map((item, productIndex) => {
                    const productFigures = figures.filter((figure) => figure.installation_product_id === item.id && figure.embedded_src);
                    const estimatedTextLines = Math.ceil(
                        ((item.structural_evaluation?.length ?? 0) + (item.general_observations?.length ?? 0)) / 100,
                    );
                    const figureColumns = productFigures.length <= 1 ? 1 : productFigures.length <= 4 ? 2 : 3;
                    const figureRows = Math.ceil(productFigures.length / figureColumns);
                    const availableFigureHeight = Math.max(
                        110,
                        395 - item.table_schema_snapshot.rows * 12 - Math.max(0, estimatedTextLines - 3) * 7,
                    );
                    const figureHeight = Math.max(64, Math.min(240, availableFigureHeight / Math.max(1, figureRows)));
                    const figureWidth = figureColumns === 1 ? "76%" : figureColumns === 2 ? "50%" : "33.333%";
                    return internalPage(`product-page-${item.id}`, "", <>
                        <View id={pdfAnchor("product", item.id)} />
                        <PaginationProbe collector={paginationCollector} probeKey={`product:${item.id}`} />
                        <Text style={styles.productInstallationName}>{installation.name}</Text>
                        <Text style={styles.productTitle}>INSTALAÇÃO {hierarchicalInstallationNumber(installationIndex, productIndex, item.suffix)}</Text>
                        <TechnicalTable item={item} />
                        {productFigures.length ? <View style={styles.productFigures} wrap={false}>
                            {productFigures.map((figure) => {
                                const figureIndex = figures.findIndex((candidate) => candidate.id === figure.id);
                                return <View key={figure.id} id={pdfAnchor("figure", figure.id)} style={[styles.productFigureItem, { width: figureWidth }]}>
                                    <PaginationProbe collector={paginationCollector} probeKey={`figure:${figure.id}`} />
                                    {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image não possui prop alt */}
                                    <Image src={figure.embedded_src!} style={[styles.productFigure, { height: figureHeight }]} />
                                    <Text style={styles.productFigureCaption}>Figura {figureIndex + 1} — {figure.caption || figure.filename}</Text>
                                </View>;
                            })}
                        </View> : null}
                    </>);
                }),
            ];
            })}
            {figures.filter((figure) => !figure.installation_id && !figure.installation_product_id).map((figure) => renderFigurePage(figure, figures.findIndex((item) => item.id === figure.id)))}
        </Document>
    );
}

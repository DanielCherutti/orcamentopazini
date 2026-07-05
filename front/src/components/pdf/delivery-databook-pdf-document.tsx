import React from "react";
import { Document, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { ProposalSettings } from "@/actions/settings-actions";
import type { CompositorPdfPayload } from "@/components/pdf/compositor-pdf-types";
import { CompositorCoverPdfPage } from "@/components/pdf/sections/compositor-cover-pdf";
import { PdfInnerPage } from "@/components/pdf/pdf-inner-page";
import { theme } from "@/components/pdf/theme";
import {
    getDeliveryAreaStatusLabel,
    getDeliveryEvidenceKindLabel,
} from "@/lib/delivery/delivery-status";
import {
    buildPdfInnerPageCommonProps,
    resolvePdfCompositorShell,
} from "@/lib/pdf/pdf-compositor-document-shell";
import { proxyPdfImageSrc, type PdfEmbeddedImages } from "@/lib/pdf/pdf-image-src";
import { sanitizeTextForPdf } from "@/lib/pdf/sanitize-pdf-text";
import type {
    DeliveryArea,
    DeliveryChecklistItem,
    DeliveryEvidence,
    DeliveryInstallation,
    DeliveryProject,
} from "@/types/delivery-types";
import type { Budget } from "@/types/budget-types";

export type DeliveryDatabookPdfPayload = {
    project: DeliveryProject;
    areas: DeliveryArea[];
    evidenceByArea: Map<string, DeliveryEvidence[]>;
    installations: DeliveryInstallation[];
    generatedAt: string;
};

export type DeliveryDatabookPdfProps = {
    payload: DeliveryDatabookPdfPayload;
    budget: Budget;
    settings: ProposalSettings;
    compositorPdf?: CompositorPdfPayload;
    pdfEmbeddedImages?: PdfEmbeddedImages;
    omitDocumentWatermark?: boolean;
};

function pdfText(value: unknown): string {
    return sanitizeTextForPdf(value);
}

function isImageEvidence(ev: DeliveryEvidence): boolean {
    const t = ev.type.toLowerCase();
    if (t.startsWith("image/")) return true;
    return /\.(jpe?g|png|gif|webp|bmp)$/i.test(ev.filename);
}

const styles = StyleSheet.create({
    tocRow: {
        flexDirection: "row",
        alignItems: "flex-end",
        marginBottom: 8,
    },
    tocCode: {
        fontSize: 10,
        fontFamily: theme.fonts.bold,
        width: 48,
        color: theme.colors.secondary,
        flexShrink: 0,
    },
    tocTitle: {
        fontSize: 10,
        flexShrink: 0,
        maxWidth: 320,
    },
    tocDots: {
        flex: 1,
        minWidth: 24,
        borderBottomWidth: 0.5,
        borderBottomColor: "#888",
        marginHorizontal: 6,
        marginBottom: 3,
    },
    tocStatus: {
        fontSize: 9,
        color: theme.colors.textLight,
        flexShrink: 0,
    },
    paragraph: {
        fontSize: 9,
        lineHeight: 1.45,
        marginBottom: 8,
        color: theme.colors.text,
    },
    sectionTitle: {
        fontFamily: theme.fonts.bold,
        fontSize: 10,
        color: theme.colors.secondary,
        marginTop: 10,
        marginBottom: 6,
    },
    checklistRow: {
        flexDirection: "row",
        marginBottom: 4,
        paddingLeft: 4,
    },
    checklistMark: {
        width: 14,
        fontFamily: theme.fonts.bold,
        color: theme.colors.primary,
    },
    checklistText: {
        flex: 1,
        fontSize: 9,
        lineHeight: 1.35,
    },
    tableHeader: {
        flexDirection: "row",
        backgroundColor: theme.colors.bgHeader,
        borderWidth: 1,
        borderColor: theme.colors.border,
        paddingVertical: 4,
        paddingHorizontal: 6,
    },
    tableRow: {
        flexDirection: "row",
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
        paddingVertical: 4,
        paddingHorizontal: 6,
    },
    colCode: { width: "18%", fontSize: 8 },
    colDesc: { width: "42%", fontSize: 8 },
    colQty: { width: "10%", fontSize: 8, textAlign: "center" },
    colTag: { width: "30%", fontSize: 8 },
    tableHeaderText: {
        fontFamily: theme.fonts.bold,
        fontSize: 8,
        color: theme.colors.textLight,
    },
    photoGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 4,
    },
    photoCell: {
        width: "48%",
        marginBottom: 8,
    },
    photoImage: {
        width: "100%",
        height: 120,
        objectFit: "cover",
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    photoCaption: {
        fontSize: 7,
        color: theme.colors.textLight,
        marginTop: 3,
    },
    emptyNote: {
        fontSize: 9,
        color: theme.colors.textLight,
        fontStyle: "italic",
    },
});

function ChecklistSection({ items }: { items: DeliveryChecklistItem[] }) {
    if (items.length === 0) {
        return <Text style={styles.emptyNote}>Nenhum item no checklist.</Text>;
    }
    return (
        <View>
            {items.map((item, idx) => (
                <View key={item.id ?? idx} style={styles.checklistRow}>
                    <Text style={styles.checklistMark}>{item.done ? "✓" : "○"}</Text>
                    <Text style={styles.checklistText}>{pdfText(item.text)}</Text>
                </View>
            ))}
        </View>
    );
}

function InstallationsSection({ installations }: { installations: DeliveryInstallation[] }) {
    if (installations.length === 0) {
        return <Text style={styles.emptyNote}>Nenhum equipamento vinculado.</Text>;
    }
    return (
        <View>
            <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, styles.colCode]}>Código</Text>
                <Text style={[styles.tableHeaderText, styles.colDesc]}>Descrição</Text>
                <Text style={[styles.tableHeaderText, styles.colQty]}>Qtd</Text>
                <Text style={[styles.tableHeaderText, styles.colTag]}>TAG / Série</Text>
            </View>
            {installations.map((ins, idx) => (
                <View key={ins.id ?? idx} style={styles.tableRow}>
                    <Text style={styles.colCode}>{pdfText(ins.equipment_code ?? "—")}</Text>
                    <Text style={styles.colDesc}>{pdfText(ins.equipment_description ?? "—")}</Text>
                    <Text style={styles.colQty}>{String(ins.quantity)}</Text>
                    <Text style={styles.colTag}>
                        {pdfText(
                            [ins.tag, ins.serial_number].filter(Boolean).join(" · ") || "—",
                        )}
                    </Text>
                </View>
            ))}
        </View>
    );
}

function EvidenceSection({
    evidences,
    pdfEmbeddedImages,
    appPublicUrl,
}: {
    evidences: DeliveryEvidence[];
    pdfEmbeddedImages?: PdfEmbeddedImages;
    appPublicUrl?: string;
}) {
    const photos = evidences.filter(isImageEvidence);
    if (photos.length === 0) {
        return <Text style={styles.emptyNote}>Nenhuma foto registrada.</Text>;
    }
    return (
        <View style={styles.photoGrid}>
            {photos.map((ev, idx) => {
                const src = proxyPdfImageSrc(ev.url, appPublicUrl, pdfEmbeddedImages);
                if (!src) return null;
                return (
                    <View key={ev.id ?? idx} style={styles.photoCell}>
                        <Image src={src} style={styles.photoImage} />
                        <Text style={styles.photoCaption}>
                            {pdfText(getDeliveryEvidenceKindLabel(ev.kind))}
                            {ev.caption ? ` — ${pdfText(ev.caption)}` : ""}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
}

export function DeliveryDatabookPdfDocument({
    payload,
    budget,
    settings,
    compositorPdf,
    pdfEmbeddedImages,
    omitDocumentWatermark = false,
}: DeliveryDatabookPdfProps) {
    const { project, areas, evidenceByArea, installations } = payload;
    const shell = resolvePdfCompositorShell(compositorPdf, settings, pdfEmbeddedImages);
    const innerCommon = buildPdfInnerPageCommonProps(
        shell,
        settings,
        budget,
        pdfEmbeddedImages,
        omitDocumentWatermark,
    );

    return (
        <Document
            title={`DataBook — ${pdfText(project.title)}`}
            author={pdfText(settings.company_name ?? "Pazini")}
        >
            <CompositorCoverPdfPage
                budget={budget}
                settings={settings}
                coverProps={shell.compositorCoverMerged}
                headerFooterProps={shell.headerFooterProps}
                pdfEmbeddedImages={pdfEmbeddedImages}
            />

            <PdfInnerPage pageKey="databook-toc" title="Sumário de áreas (AD)" {...innerCommon}>
                {areas.map((area) => (
                    <View key={area.id ?? area.code} style={styles.tocRow}>
                        <Text style={styles.tocCode}>{pdfText(area.code)}</Text>
                        <Text style={styles.tocTitle}>{pdfText(area.title)}</Text>
                        <View style={styles.tocDots} />
                        <Text style={styles.tocStatus}>
                            {pdfText(getDeliveryAreaStatusLabel(area.status))}
                        </Text>
                    </View>
                ))}
            </PdfInnerPage>

            {areas.map((area) => {
                const areaEvidences = evidenceByArea.get(area.id ?? "") ?? [];
                const areaInstallations = installations.filter(
                    (i) => i.delivery_area_id === area.id,
                );
                return (
                    <PdfInnerPage
                        key={area.id ?? area.code}
                        pageKey={`area-${area.id ?? area.code}`}
                        title={`${area.code} — ${area.title}`}
                        wrap
                        {...innerCommon}
                    >
                        {area.description ? (
                            <Text style={styles.paragraph}>{pdfText(area.description)}</Text>
                        ) : null}
                        <Text style={styles.sectionTitle}>Checklist de adequação</Text>
                        <ChecklistSection items={area.checklist ?? []} />
                        <Text style={styles.sectionTitle}>Equipamentos instalados</Text>
                        <InstallationsSection installations={areaInstallations} />
                        <Text style={styles.sectionTitle}>Registro fotográfico</Text>
                        <EvidenceSection
                            evidences={areaEvidences}
                            pdfEmbeddedImages={pdfEmbeddedImages}
                            appPublicUrl={settings.app_public_url}
                        />
                    </PdfInnerPage>
                );
            })}
        </Document>
    );
}

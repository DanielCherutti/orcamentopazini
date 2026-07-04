import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { ProposalSettings } from "@/actions/settings-actions";
import { theme } from "@/components/pdf/theme";
import {
    getDeliveryAreaStatusLabel,
    getDeliveryEvidenceKindLabel,
    getDeliveryProjectStatusLabel,
} from "@/lib/delivery/delivery-status";
import { proxyPdfImageSrc } from "@/lib/pdf/pdf-image-src";
import { sanitizeTextForPdf } from "@/lib/pdf/sanitize-pdf-text";
import type {
    DeliveryArea,
    DeliveryChecklistItem,
    DeliveryEvidence,
    DeliveryInstallation,
    DeliveryProject,
} from "@/types/delivery-types";

export type DeliveryDatabookPdfPayload = {
    project: DeliveryProject;
    areas: DeliveryArea[];
    evidenceByArea: Map<string, DeliveryEvidence[]>;
    installations: DeliveryInstallation[];
    generatedAt: string;
};

export type DeliveryDatabookPdfProps = {
    payload: DeliveryDatabookPdfPayload;
    settings: ProposalSettings;
    pdfEmbeddedImages?: Record<string, string>;
    publicBase?: string;
};

function resolveBrandColor(settings: ProposalSettings, fallback: string): string {
    const c = settings.primary_color?.trim();
    return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback;
}

function resolveAccentColor(settings: ProposalSettings, fallback: string): string {
    const c = settings.secondary_color?.trim();
    return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback;
}

function pdfText(value: unknown): string {
    return sanitizeTextForPdf(value);
}

function resolveImageSrc(
    url: string | undefined,
    embedded?: Record<string, string>,
    publicBase?: string,
): string | undefined {
    const u = url?.trim();
    if (!u) return undefined;
    if (embedded?.[u]) return embedded[u];
    const proxied = proxyPdfImageSrc(u, publicBase);
    if (proxied && embedded?.[proxied]) return embedded[proxied];
    return proxied;
}

function isImageEvidence(ev: DeliveryEvidence): boolean {
    const t = ev.type.toLowerCase();
    if (t.startsWith("image/")) return true;
    return /\.(jpe?g|png|gif|webp|bmp)$/i.test(ev.filename);
}

function createStyles(primary: string, accent: string) {
    return StyleSheet.create({
        page: {
            ...theme.layout.pageParams.style,
            fontFamily: theme.fonts.body,
            fontSize: 10,
            color: theme.colors.text,
        },
        coverPage: {
            ...theme.layout.pageParams.style,
            fontFamily: theme.fonts.body,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: theme.colors.bgLight,
        },
        coverBand: {
            width: "100%",
            backgroundColor: primary,
            paddingVertical: 28,
            paddingHorizontal: 40,
            marginBottom: 32,
        },
        coverBandTitle: {
            fontFamily: theme.fonts.bold,
            fontSize: 22,
            color: theme.colors.textWhite,
            marginBottom: 6,
        },
        coverBandSub: {
            fontSize: 11,
            color: "#dbeafe",
        },
        coverBody: {
            width: "100%",
            paddingHorizontal: 40,
        },
        coverMainTitle: {
            fontFamily: theme.fonts.bold,
            fontSize: 18,
            color: primary,
            marginBottom: 16,
            textAlign: "center",
        },
        coverMetaRow: {
            flexDirection: "row",
            marginBottom: 6,
        },
        coverMetaLabel: {
            width: 110,
            fontFamily: theme.fonts.bold,
            color: theme.colors.textLight,
        },
        coverMetaValue: {
            flex: 1,
        },
        headerBar: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottomWidth: 2,
            borderBottomColor: primary,
            paddingBottom: 8,
            marginBottom: 14,
        },
        headerLeft: {
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            flex: 1,
        },
        logo: {
            width: 48,
            height: 48,
            objectFit: "contain",
        },
        headerCompany: {
            fontFamily: theme.fonts.bold,
            fontSize: 11,
            color: primary,
        },
        headerSubtitle: {
            fontSize: 8,
            color: theme.colors.textLight,
        },
        headerRight: {
            fontSize: 8,
            color: theme.colors.textLight,
            textAlign: "right",
            maxWidth: 180,
        },
        footer: {
            position: "absolute",
            bottom: 28,
            left: 35,
            right: 35,
            flexDirection: "row",
            justifyContent: "space-between",
            fontSize: 8,
            color: theme.colors.textLight,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            paddingTop: 6,
        },
        tocTitle: {
            fontFamily: theme.fonts.bold,
            fontSize: 16,
            color: primary,
            marginBottom: 16,
        },
        tocRow: {
            flexDirection: "row",
            justifyContent: "space-between",
            paddingVertical: 5,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
        },
        tocCode: {
            fontFamily: theme.fonts.bold,
            width: 48,
            color: accent,
        },
        tocLabel: {
            flex: 1,
        },
        tocStatus: {
            width: 80,
            textAlign: "right",
            fontSize: 9,
            color: theme.colors.textLight,
        },
        areaBand: {
            backgroundColor: primary,
            paddingVertical: 8,
            paddingHorizontal: 12,
            marginBottom: 12,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
        },
        areaCode: {
            fontFamily: theme.fonts.bold,
            fontSize: 13,
            color: theme.colors.textWhite,
        },
        areaTitle: {
            fontFamily: theme.fonts.bold,
            fontSize: 11,
            color: theme.colors.textWhite,
            flex: 1,
            marginLeft: 10,
        },
        areaStatus: {
            fontSize: 9,
            color: "#dbeafe",
        },
        sectionTitle: {
            fontFamily: theme.fonts.bold,
            fontSize: 10,
            color: accent,
            marginTop: 10,
            marginBottom: 6,
        },
        paragraph: {
            fontSize: 9,
            lineHeight: 1.45,
            marginBottom: 8,
            color: theme.colors.text,
        },
        checklistRow: {
            flexDirection: "row",
            marginBottom: 4,
            paddingLeft: 4,
        },
        checklistMark: {
            width: 14,
            fontFamily: theme.fonts.bold,
            color: primary,
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
}

function PageHeader({
    settings,
    project,
    styles,
    pdfEmbeddedImages,
    publicBase,
}: {
    settings: ProposalSettings;
    project: DeliveryProject;
    styles: ReturnType<typeof createStyles>;
    pdfEmbeddedImages?: Record<string, string>;
    publicBase?: string;
}) {
    const logoSrc = resolveImageSrc(settings.company_logo_url, pdfEmbeddedImages, publicBase);
    return (
        <View style={styles.headerBar} fixed>
            <View style={styles.headerLeft}>
                {logoSrc ? <Image src={logoSrc} style={styles.logo} /> : null}
                <View>
                    <Text style={styles.headerCompany}>{pdfText(settings.company_name ?? "Empresa")}</Text>
                    {settings.company_header_subtitle ? (
                        <Text style={styles.headerSubtitle}>
                            {pdfText(settings.company_header_subtitle)}
                        </Text>
                    ) : null}
                </View>
            </View>
            <View style={styles.headerRight}>
                <Text>{pdfText(project.title)}</Text>
                {project.contract_ref ? (
                    <Text>Ref.: {pdfText(project.contract_ref)}</Text>
                ) : null}
            </View>
        </View>
    );
}

function PageFooter({
    project,
    generatedAt,
    styles,
}: {
    project: DeliveryProject;
    generatedAt: string;
    styles: ReturnType<typeof createStyles>;
}) {
    return (
        <View style={styles.footer} fixed>
            <Text>DataBook — Entrega Técnica</Text>
            <Text>
                {pdfText(project.client_name ?? "")}
                {project.budget_code ? ` · OB ${pdfText(project.budget_code)}` : ""}
            </Text>
            <Text
                render={({ pageNumber, totalPages }) =>
                    `Pág. ${pageNumber} / ${totalPages} · ${generatedAt}`
                }
            />
        </View>
    );
}

function ChecklistSection({
    items,
    styles,
}: {
    items: DeliveryChecklistItem[];
    styles: ReturnType<typeof createStyles>;
}) {
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

function InstallationsSection({
    installations,
    styles,
}: {
    installations: DeliveryInstallation[];
    styles: ReturnType<typeof createStyles>;
}) {
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
    styles,
    pdfEmbeddedImages,
    publicBase,
}: {
    evidences: DeliveryEvidence[];
    styles: ReturnType<typeof createStyles>;
    pdfEmbeddedImages?: Record<string, string>;
    publicBase?: string;
}) {
    const photos = evidences.filter(isImageEvidence);
    if (photos.length === 0) {
        return <Text style={styles.emptyNote}>Nenhuma foto registrada.</Text>;
    }
    return (
        <View style={styles.photoGrid}>
            {photos.map((ev, idx) => {
                const src = resolveImageSrc(ev.url, pdfEmbeddedImages, publicBase);
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
    settings,
    pdfEmbeddedImages,
    publicBase,
}: DeliveryDatabookPdfProps) {
    const { project, areas, evidenceByArea, installations, generatedAt } = payload;
    const primary = resolveBrandColor(settings, theme.colors.primary);
    const accent = resolveAccentColor(settings, theme.colors.secondary);
    const styles = createStyles(primary, accent);
    const logoSrc = resolveImageSrc(settings.company_logo_url, pdfEmbeddedImages, publicBase);

    const doneCount = areas.filter((a) => a.status === "done").length;

    return (
        <Document
            title={`DataBook — ${pdfText(project.title)}`}
            author={pdfText(settings.company_name ?? "Pazini")}
        >
            <Page size="A4" style={styles.coverPage}>
                <View style={styles.coverBand}>
                    <Text style={styles.coverBandTitle}>
                        {pdfText(settings.company_name ?? "Entrega Técnica")}
                    </Text>
                    {settings.company_header_subtitle ? (
                        <Text style={styles.coverBandSub}>
                            {pdfText(settings.company_header_subtitle)}
                        </Text>
                    ) : null}
                </View>
                <View style={styles.coverBody}>
                    {logoSrc ? (
                        <Image
                            src={logoSrc}
                            style={{ width: 100, height: 60, objectFit: "contain", alignSelf: "center", marginBottom: 20 }}
                        />
                    ) : null}
                    <Text style={styles.coverMainTitle}>MEMORIAL DE ENTREGA TÉCNICA</Text>
                    <View style={styles.coverMetaRow}>
                        <Text style={styles.coverMetaLabel}>Projeto</Text>
                        <Text style={styles.coverMetaValue}>{pdfText(project.title)}</Text>
                    </View>
                    {project.client_name ? (
                        <View style={styles.coverMetaRow}>
                            <Text style={styles.coverMetaLabel}>Cliente</Text>
                            <Text style={styles.coverMetaValue}>{pdfText(project.client_name)}</Text>
                        </View>
                    ) : null}
                    {project.budget_code ? (
                        <View style={styles.coverMetaRow}>
                            <Text style={styles.coverMetaLabel}>Orçamento</Text>
                            <Text style={styles.coverMetaValue}>{pdfText(project.budget_code)}</Text>
                        </View>
                    ) : null}
                    {project.contract_ref ? (
                        <View style={styles.coverMetaRow}>
                            <Text style={styles.coverMetaLabel}>Referência</Text>
                            <Text style={styles.coverMetaValue}>{pdfText(project.contract_ref)}</Text>
                        </View>
                    ) : null}
                    {project.databook_template_name ? (
                        <View style={styles.coverMetaRow}>
                            <Text style={styles.coverMetaLabel}>Modelo DataBook</Text>
                            <Text style={styles.coverMetaValue}>
                                {pdfText(project.databook_template_name)}
                            </Text>
                        </View>
                    ) : null}
                    <View style={styles.coverMetaRow}>
                        <Text style={styles.coverMetaLabel}>Status</Text>
                        <Text style={styles.coverMetaValue}>
                            {pdfText(getDeliveryProjectStatusLabel(project.status))}
                        </Text>
                    </View>
                    <View style={styles.coverMetaRow}>
                        <Text style={styles.coverMetaLabel}>Progresso</Text>
                        <Text style={styles.coverMetaValue}>
                            {doneCount} de {areas.length} áreas concluídas
                        </Text>
                    </View>
                    {project.gestor_nome ? (
                        <View style={styles.coverMetaRow}>
                            <Text style={styles.coverMetaLabel}>Gestor</Text>
                            <Text style={styles.coverMetaValue}>
                                {pdfText(project.gestor_nome)}
                                {project.gestor_phone ? ` · ${pdfText(project.gestor_phone)}` : ""}
                            </Text>
                        </View>
                    ) : null}
                    <View style={[styles.coverMetaRow, { marginTop: 16 }]}>
                        <Text style={styles.coverMetaLabel}>Gerado em</Text>
                        <Text style={styles.coverMetaValue}>{generatedAt}</Text>
                    </View>
                </View>
            </Page>

            <Page size="A4" style={styles.page}>
                <PageHeader
                    settings={settings}
                    project={project}
                    styles={styles}
                    pdfEmbeddedImages={pdfEmbeddedImages}
                    publicBase={publicBase}
                />
                <Text style={styles.tocTitle}>Sumário de áreas (AD)</Text>
                {areas.map((area) => (
                    <View key={area.id ?? area.code} style={styles.tocRow}>
                        <Text style={styles.tocCode}>{pdfText(area.code)}</Text>
                        <Text style={styles.tocLabel}>{pdfText(area.title)}</Text>
                        <Text style={styles.tocStatus}>
                            {pdfText(getDeliveryAreaStatusLabel(area.status))}
                        </Text>
                    </View>
                ))}
                <PageFooter project={project} generatedAt={generatedAt} styles={styles} />
            </Page>

            {areas.map((area) => {
                const areaEvidences = evidenceByArea.get(area.id ?? "") ?? [];
                const areaInstallations = installations.filter(
                    (i) => i.delivery_area_id === area.id,
                );
                return (
                    <Page key={area.id ?? area.code} size="A4" style={styles.page} wrap>
                        <PageHeader
                            settings={settings}
                            project={project}
                            styles={styles}
                            pdfEmbeddedImages={pdfEmbeddedImages}
                            publicBase={publicBase}
                        />
                        <View style={styles.areaBand}>
                            <Text style={styles.areaCode}>{pdfText(area.code)}</Text>
                            <Text style={styles.areaTitle}>{pdfText(area.title)}</Text>
                            <Text style={styles.areaStatus}>
                                {pdfText(getDeliveryAreaStatusLabel(area.status))}
                            </Text>
                        </View>
                        {area.description ? (
                            <Text style={styles.paragraph}>{pdfText(area.description)}</Text>
                        ) : null}
                        <Text style={styles.sectionTitle}>Checklist de adequação</Text>
                        <ChecklistSection items={area.checklist ?? []} styles={styles} />
                        <Text style={styles.sectionTitle}>Equipamentos instalados</Text>
                        <InstallationsSection installations={areaInstallations} styles={styles} />
                        <Text style={styles.sectionTitle}>Registro fotográfico</Text>
                        <EvidenceSection
                            evidences={areaEvidences}
                            styles={styles}
                            pdfEmbeddedImages={pdfEmbeddedImages}
                            publicBase={publicBase}
                        />
                        <PageFooter project={project} generatedAt={generatedAt} styles={styles} />
                    </Page>
                );
            })}
        </Document>
    );
}

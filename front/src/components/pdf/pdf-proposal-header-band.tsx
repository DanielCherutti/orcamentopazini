import React from "react";
import { View, Image, Text, StyleSheet } from "@react-pdf/renderer";
import type { ProposalSettings } from "@/actions/settings-actions";
import { theme } from "@/components/pdf/theme";
import { sanitizeTextForPdf } from "@/lib/pdf/sanitize-pdf-text";
import {
    buildPdfContactLines,
    resolvePdfHeaderPrimaryColor,
} from "@/lib/pdf/pdf-proposal-header";

const styles = StyleSheet.create({
    band: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        width: "100%",
    },
    leftBlock: {
        flexDirection: "row",
        alignItems: "flex-start",
        flexGrow: 1,
        flexShrink: 1,
        maxWidth: "52%",
    },
    logo: {
        height: 38,
        width: 96,
        marginRight: 10,
        objectFit: "contain",
    },
    nameStack: {
        flexShrink: 1,
    },
    companyName: {
        fontSize: 13,
        fontFamily: theme.fonts.bold,
        textTransform: "uppercase",
        lineHeight: 1.2,
    },
    subtitle: {
        fontSize: 7.5,
        marginTop: 3,
        letterSpacing: 1.8,
        textTransform: "uppercase",
        lineHeight: 1.3,
    },
    rightBlock: {
        flexGrow: 1,
        flexShrink: 1,
        maxWidth: "48%",
        alignItems: "flex-end",
    },
    contactLine: {
        fontSize: 7.5,
        lineHeight: 1.35,
        marginBottom: 2,
        textAlign: "right",
    },
});

/**
 * Cabeçalho em duas colunas (modelo comercial): marca à esquerda, contatos à direita.
 * Cores vêm da cor primária em Configurações.
 */
export function PdfProposalHeaderBand({
    settings,
    logoSrc,
    companyName,
}: {
    settings: ProposalSettings;
    logoSrc?: string;
    /** Já resolvido (capa pode usar override do bloco). */
    companyName: string;
}) {
    const color = resolvePdfHeaderPrimaryColor(settings);
    const fill = settings.pdf_header_fill_from_settings === true;
    const subtitle = fill
        ? sanitizeTextForPdf(settings.company_header_subtitle?.trim() || "")
        : "";
    const name = sanitizeTextForPdf(companyName.trim());
    const lines = fill
        ? buildPdfContactLines(settings).map((l) => sanitizeTextForPdf(l))
        : [];

    return (
        <View style={styles.band}>
            <View style={[styles.leftBlock, lines.length === 0 ? { maxWidth: "100%" } : {}]}>
                {logoSrc ? (
                    /* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */
                    <Image src={logoSrc} style={styles.logo} />
                ) : null}
                <View style={styles.nameStack}>
                    {name ? <Text style={[styles.companyName, { color }]}>{name}</Text> : null}
                    {subtitle ? (
                        <Text style={[styles.subtitle, { color }]}>{subtitle}</Text>
                    ) : null}
                </View>
            </View>
            {lines.length > 0 ? (
                <View style={styles.rightBlock}>
                    {lines.map((line, i) => (
                        <Text key={`ct-${i}`} style={[styles.contactLine, { color }]}>
                            {line}
                        </Text>
                    ))}
                </View>
            ) : null}
        </View>
    );
}

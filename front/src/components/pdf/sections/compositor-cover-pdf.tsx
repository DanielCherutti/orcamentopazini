import React from "react";
import { Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { Budget } from "@/types/budget-types";
import type { ProposalSettings } from "@/actions/settings-actions";
import type { CoverBlockProps, CoverSectionAlign, CoverSectionId } from "@/types/budget-compositor-types";
import {
  coverSectionAlignFor,
  normalizeCoverSectionOrder,
  normalizeCoverTitlesOrder,
} from "@/types/budget-compositor-types";
import { theme } from "../theme";

/** react-pdf costuma exigir URL absoluta para carregar imagens */
function resolvePdfImageSrc(url: string | undefined, publicBase?: string): string | undefined {
  const u = url?.trim();
  if (!u) return undefined;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("//")) return `https:${u}`;
  if (u.startsWith("/")) {
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}${u}`;
    }
    const b = publicBase?.replace(/\/$/, "");
    if (b) return `${b}${u}`;
  }
  return u;
}

/** A4 em pt (react-pdf) — evita % em Image, que costuma quebrar layout */
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const PAD_X = Math.round(PAGE_W * 0.07);
const PAD_Y = Math.round(PAGE_H * 0.07);
const INNER_W = PAGE_W - PAD_X * 2;
const LOGO_MAX_W = 128;
const LOGO_H = 36;
const CLIENT_LOGO_MAX_W = Math.round(INNER_W * 0.72);

const styles = StyleSheet.create({
  page: {
    fontFamily: theme.fonts.body,
    backgroundColor: "#FFFFFF",
    position: "relative",
    width: PAGE_W,
    height: PAGE_H,
  },
  /** Camada da marca d’água — atrás do conteúdo */
  watermarkLayer: {
    position: "absolute",
    left: 0,
    top: 0,
    width: PAGE_W,
    height: PAGE_H,
    zIndex: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  watermarkImg: {
    width: Math.round(PAGE_W * 0.82),
    height: Math.round(PAGE_H * 0.82),
    objectFit: "contain",
  },
  /** Folha opaca por cima da marca d’água (evita texto “fantasma” / sobreposição) */
  contentLayer: {
    position: "relative",
    zIndex: 1,
    width: PAGE_W,
    height: PAGE_H,
    backgroundColor: "#FFFFFF",
    paddingTop: PAD_Y,
    paddingBottom: PAD_Y,
    paddingHorizontal: PAD_X,
    flexDirection: "column",
  },
  column: {
    width: INNER_W,
    flexGrow: 1,
    flexDirection: "column",
  },
  section: {
    width: INNER_W,
    marginBottom: 10,
  },
  companyRow: {
    width: INNER_W,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#d4d4d4",
  },
  logo: {
    height: LOGO_H,
    width: LOGO_MAX_W,
    objectFit: "contain",
  },
  mainTitle: {
    fontSize: 15,
    fontFamily: theme.fonts.bold,
    textTransform: "uppercase",
    color: "#171717",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 10,
    color: "#404040",
    lineHeight: 1.4,
    marginBottom: 4,
  },
  clientLogo: {
    maxHeight: 88,
    width: CLIENT_LOGO_MAX_W,
    objectFit: "contain",
    marginTop: 8,
    marginBottom: 8,
  },
  cadBlock: {
    width: INNER_W,
    borderTopWidth: 1,
    borderTopColor: "#e5e5e5",
    paddingTop: 10,
    marginTop: 2,
  },
  cadLine: {
    width: INNER_W,
    marginBottom: 5,
  },
  cadLabel: {
    fontSize: 9,
    fontFamily: theme.fonts.bold,
    color: "#171717",
  },
  cadValue: {
    fontSize: 9,
    color: "#171717",
    lineHeight: 1.4,
  },
  footerBlock: {
    width: INNER_W,
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e5e5e5",
  },
  engineerName: {
    fontSize: 10,
    fontFamily: theme.fonts.bold,
    textTransform: "uppercase",
    marginBottom: 4,
    color: "#171717",
  },
  footerMuted: {
    fontSize: 9,
    color: "#525252",
    marginTop: 4,
    lineHeight: 1.35,
  },
  refLine: {
    fontSize: 9,
    color: "#262626",
    marginTop: 6,
  },
  bottomRule: {
    marginTop: 12,
    height: 2,
    backgroundColor: "#d4d4d4",
    width: INNER_W,
  },
});

function alignText(align: CoverSectionAlign): "left" | "center" | "right" {
  if (align === "center") return "center";
  if (align === "right") return "right";
  return "left";
}

function sectionAlignStyle(align: CoverSectionAlign) {
  if (align === "center") return { alignItems: "center" as const, alignSelf: "center" as const };
  if (align === "right") return { alignItems: "flex-end" as const, alignSelf: "flex-end" as const };
  return { alignItems: "flex-start" as const, alignSelf: "flex-start" as const };
}

function renderCompanyHeader(
  id: CoverSectionId,
  coverProps: CoverBlockProps,
  settings: ProposalSettings,
) {
  const align = coverSectionAlignFor(id, coverProps.section_align);
  const ta = alignText(align);
  const rowJustify =
    align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
  const logoSrc = resolvePdfImageSrc(settings.company_logo_url, settings.app_public_url);
  return (
    <View key={id} style={[styles.section, sectionAlignStyle(align)]}>
      <View style={[styles.companyRow, { justifyContent: rowJustify }]}>
        {logoSrc ? (
          <>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
            <Image src={logoSrc} style={styles.logo} />
          </>
        ) : (
          <Text style={{ fontSize: 11, fontFamily: theme.fonts.bold, color: "#171717", textAlign: ta }}>
            {settings.company_name || "Empresa"}
          </Text>
        )}
      </View>
    </View>
  );
}

function renderMainTitles(id: CoverSectionId, coverProps: CoverBlockProps) {
  const align = coverSectionAlignFor(id, coverProps.section_align);
  const ta = alignText(align);
  const titlesOrder = normalizeCoverTitlesOrder(coverProps.titles_order);
  return (
    <View key={id} style={[styles.section, sectionAlignStyle(align)]}>
      <View style={{ width: INNER_W, alignItems: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start" }}>
        {titlesOrder.map((part, idx) =>
          part === "main" ? (
            <Text key={`title-main-${idx}`} style={[styles.mainTitle, { textAlign: ta, maxWidth: INNER_W }]}>
              {(coverProps.main_title || "PROPOSTA COMERCIAL").trim()}
            </Text>
          ) : (coverProps.subtitle || "").trim() ? (
            <Text key={`title-sub-${idx}`} style={[styles.subtitle, { textAlign: ta, maxWidth: INNER_W }]}>
              {(coverProps.subtitle || "").trim()}
            </Text>
          ) : null,
        )}
      </View>
    </View>
  );
}

function renderClientLogo(
  id: CoverSectionId,
  coverProps: CoverBlockProps,
  publicBase?: string,
) {
  const align = coverSectionAlignFor(id, coverProps.section_align);
  const url = resolvePdfImageSrc(coverProps.client_logo_url, publicBase);
  if (!url) {
    return (
      <View key={id} style={[styles.section, sectionAlignStyle(align)]}>
        <Text style={{ fontSize: 8, color: "#737373" }}>—</Text>
      </View>
    );
  }
  return (
    <View key={id} style={[styles.section, sectionAlignStyle(align)]}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
      <Image src={url} style={styles.clientLogo} />
    </View>
  );
}

function renderClientCadastral(id: CoverSectionId, coverProps: CoverBlockProps) {
  const align = coverSectionAlignFor(id, coverProps.section_align);
  const ta = alignText(align);
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, v?: string) => {
    const t = v?.trim();
    if (t) rows.push({ label, value: t });
  };
  add("RAZÃO SOCIAL", coverProps.client_legal_name);
  add("NOME FANTASIA", coverProps.client_trade_name);
  add("CNPJ", coverProps.client_cnpj);
  add("MUNICÍPIO", coverProps.client_municipality);
  add("ENDEREÇO", coverProps.client_address);
  add("CEP", coverProps.client_cep);
  if (coverProps.client_classified_areas?.trim()) {
    rows.push({
      label: "TIPOS DE EC / ÁREA CLASSIFICADA",
      value: coverProps.client_classified_areas.trim(),
    });
  }
  if (rows.length === 0) return null;
  return (
    <View key={id} style={[styles.section, { alignItems: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start" }]}>
      <View style={styles.cadBlock}>
        {rows.map((r) => (
          <View key={r.label} style={styles.cadLine} wrap={false}>
            <Text style={{ textAlign: ta, maxWidth: INNER_W }}>
              <Text style={styles.cadLabel}>{r.label}: </Text>
              <Text style={styles.cadValue}>{r.value}</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function renderProfessionalFooter(
  id: CoverSectionId,
  coverProps: CoverBlockProps,
  budget: Budget,
  formattedDateLong: string,
) {
  const align = coverSectionAlignFor(id, coverProps.section_align);
  const ta = alignText(align);
  const cityLine = (coverProps.issuer_city_line?.trim() || "—").toUpperCase();
  const refLine = [budget.code, coverProps.revision_label?.trim()].filter(Boolean).join(" · ");
  return (
    <View key={id} style={[styles.section, sectionAlignStyle(align)]}>
      <View style={styles.footerBlock}>
        {coverProps.engineer_name?.trim() ? (
          <Text style={[styles.engineerName, { textAlign: ta, width: INNER_W }]}>{coverProps.engineer_name.trim()}</Text>
        ) : null}
        {coverProps.engineer_crea?.trim() ? (
          <Text style={[styles.cadValue, { textAlign: ta, width: INNER_W, marginBottom: 2 }]}>
            CREA: {coverProps.engineer_crea.trim()}
          </Text>
        ) : null}
        <Text style={[styles.footerMuted, { textAlign: ta, width: INNER_W }]}>
          {cityLine}, {formattedDateLong.toUpperCase()}
        </Text>
        {refLine ? (
          <Text style={[styles.refLine, { textAlign: ta, width: INNER_W }]}>Ref: {refLine}</Text>
        ) : null}
      </View>
    </View>
  );
}

function renderSection(
  id: CoverSectionId,
  coverProps: CoverBlockProps,
  settings: ProposalSettings,
  budget: Budget,
  formattedDateLong: string,
): React.ReactNode {
  switch (id) {
    case "company_header":
      return renderCompanyHeader(id, coverProps, settings);
    case "main_titles":
      return renderMainTitles(id, coverProps);
    case "client_logo":
      return renderClientLogo(id, coverProps, settings.app_public_url);
    case "client_cadastral":
      return renderClientCadastral(id, coverProps);
    case "professional_footer":
      return renderProfessionalFooter(id, coverProps, budget, formattedDateLong);
    default:
      return null;
  }
}

export function CompositorCoverPdfPage({
  budget,
  settings,
  coverProps,
}: {
  budget: Budget;
  settings: ProposalSettings;
  coverProps: CoverBlockProps;
}) {
  const issueDate =
    budget.issue_date
      ? new Date(budget.issue_date)
      : budget.created_at
        ? new Date(budget.created_at)
        : new Date();
  const formattedDateLong = issueDate.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const sectionOrder = normalizeCoverSectionOrder(coverProps.section_order);
  const wmResolved = resolvePdfImageSrc(coverProps.cover_watermark_url, settings.app_public_url);
  const wmOpacity = coverProps.cover_watermark_opacity ?? 0.12;

  return (
    <Page size="A4" style={styles.page}>
      {wmResolved ? (
        <View style={styles.watermarkLayer}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
          <Image src={wmResolved} style={[styles.watermarkImg, { opacity: wmOpacity }]} />
        </View>
      ) : null}

      <View style={styles.contentLayer}>
        <View style={styles.column}>
          {sectionOrder.map((sid) => renderSection(sid, coverProps, settings, budget, formattedDateLong))}
        </View>
        <View style={styles.bottomRule} />
      </View>
    </Page>
  );
}

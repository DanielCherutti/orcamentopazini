import type { ProposalSettings } from "@/actions/settings-actions";
import type { Budget } from "@/types/budget-types";
import type { CoverBlockProps } from "@/types/budget-compositor-types";
import { hasPdfContactLines } from "@/lib/pdf/pdf-proposal-header";

export type CoverPdfBandContext = {
    dateLabel: string;
    code: string;
    title: string;
};

export function formatPdfCoverDate(iso: string | undefined): string {
    if (!iso || !iso.trim()) return "";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    try {
        return d.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    } catch {
        return "";
    }
}

export function buildCoverPdfBandContext(budget: Budget): CoverPdfBandContext {
    const issueRaw = budget.issue_date || budget.updated_at || budget.created_at;
    const dateLabel = formatPdfCoverDate(issueRaw);
    return {
        dateLabel,
        code: (budget.code || "").trim() || "—",
        title: (budget.title || "").trim() || "—",
    };
}

function interpolateCoverPdfTemplate(template: string, ctx: CoverPdfBandContext): string {
    return template
        .replace(/\{\{date\}\}/gi, ctx.dateLabel)
        .replace(/\{\{code\}\}/gi, ctx.code)
        .replace(/\{\{title\}\}/gi, ctx.title);
}

export function resolveCoverPdfShowHeaderBand(coverProps: CoverBlockProps): boolean {
    return coverProps.cover_pdf_show_header_band !== false;
}

export function resolveCoverPdfShowFooterBand(coverProps: CoverBlockProps): boolean {
    return coverProps.cover_pdf_show_footer_band !== false;
}

export function resolveCoverPdfHeaderCompanyText(
    coverProps: CoverBlockProps,
    settingsCompanyName: string | undefined
): string {
    const o = coverProps.cover_pdf_header_company_override?.trim();
    if (o) return o;
    return (settingsCompanyName || "").trim();
}

/** URL bruta (antes de proxy no PDF). */
export function resolveCoverPdfHeaderLogoUrl(
    coverProps: CoverBlockProps,
    settingsLogoUrl: string | undefined
): string | undefined {
    const o = coverProps.cover_pdf_header_logo_url_override?.trim();
    if (o) return o;
    const s = settingsLogoUrl?.trim();
    return s || undefined;
}

export function formatCoverPdfFooterLeftText(
    coverProps: CoverBlockProps,
    ctx: CoverPdfBandContext
): string {
    const t = coverProps.cover_pdf_footer_left_template?.trim();
    if (t) {
        return interpolateCoverPdfTemplate(t, ctx);
    }
    return "";
}

/** Texto fixo na capa (canto inferior esquerdo) — não é faixa de rodapé. */
export function formatCoverBudgetCodeLabel(ctx: CoverPdfBandContext): string {
    return `Código do Orçamento: ${ctx.code}`;
}

export function shouldShowCoverBudgetCodeStamp(
    coverProps: CoverBlockProps,
    hasCustomCoverFooterHtml: boolean,
    hasCoverFooterLayout: boolean,
): boolean {
    if (hasCustomCoverFooterHtml || hasCoverFooterLayout) return false;
    if (coverProps.cover_pdf_footer_left_template?.trim()) return false;
    return true;
}

export function formatCoverPdfFooterRightText(
    coverProps: CoverBlockProps,
    ctx: CoverPdfBandContext
): string {
    const t = coverProps.cover_pdf_footer_right_template?.trim();
    if (t) {
        return interpolateCoverPdfTemplate(t, ctx);
    }
    return "";
}

export function shouldShowCoverPdfHeaderBand(
    coverProps: CoverBlockProps,
    settings?: ProposalSettings | null
): boolean {
    if (!resolveCoverPdfShowHeaderBand(coverProps)) return false;
    if (!settings) {
        const company = resolveCoverPdfHeaderCompanyText(coverProps, undefined);
        const logo = resolveCoverPdfHeaderLogoUrl(coverProps, undefined);
        return Boolean(company || logo);
    }
    const overrideName = coverProps.cover_pdf_header_company_override?.trim();
    const overrideLogo = coverProps.cover_pdf_header_logo_url_override?.trim();
    const hasCompositorOverride = Boolean(overrideName || overrideLogo);
    if (hasCompositorOverride) return true;

    if (settings.pdf_header_fill_from_settings !== true) return false;

    const company = resolveCoverPdfHeaderCompanyText(coverProps, settings.company_name);
    const logo = resolveCoverPdfHeaderLogoUrl(coverProps, settings.company_logo_url);
    const sub = settings.company_header_subtitle?.trim();
    return Boolean(company || logo || sub || hasPdfContactLines(settings));
}

/**
 * Faixa de cabeçalho na **página capa** do PDF.
 * `cover_pdf_show_header_band === false` na capa prevalece sobre `legacy_cover_pdf_show_header_band === true`
 * no bloco cabeçalho/rodapé (o antigo `true ?? shouldShow(...)` ignorava “sem cabeçalho”).
 */
export function resolveCoverPageShowHeaderBand(
    coverProps: CoverBlockProps,
    settings: ProposalSettings,
    headerFooterProps:
        | { cover_show_header_band?: boolean; legacy_cover_pdf_show_header_band?: boolean }
        | undefined,
    hasCustomCoverHeaderHtml: boolean,
): boolean {
    if (headerFooterProps?.cover_show_header_band === false) return false;
    if (headerFooterProps?.cover_show_header_band === true) return true;
    if (coverProps.cover_pdf_show_header_band === false) return false;
    if (headerFooterProps?.legacy_cover_pdf_show_header_band === false) return false;
    if (hasCustomCoverHeaderHtml) return true;
    return shouldShowCoverPdfHeaderBand(coverProps, settings);
}

/** Rodapé da capa: idem com `cover_pdf_show_footer_band`. */
export function resolveCoverPageShowFooterBand(
    coverProps: CoverBlockProps,
    headerFooterProps:
        | { cover_show_footer_band?: boolean; legacy_cover_pdf_show_footer_band?: boolean }
        | undefined,
    hasCustomCoverFooterHtml: boolean,
): boolean {
    if (headerFooterProps?.cover_show_footer_band === false) return false;
    if (headerFooterProps?.cover_show_footer_band === true) return true;
    if (coverProps.cover_pdf_show_footer_band === false) return false;
    if (headerFooterProps?.legacy_cover_pdf_show_footer_band === false) return false;
    if (hasCustomCoverFooterHtml) return true;
    return resolveCoverPdfShowFooterBand(coverProps);
}

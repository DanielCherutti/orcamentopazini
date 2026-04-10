import type { ProposalSettings } from "@/actions/settings-actions";
import { BRAND_DEFAULT_PRIMARY, normalizeHex } from "@/lib/branding-theme";

/** Linhas de contato exibidas à direita do cabeçalho do PDF (rótulo + valor). */
export function buildPdfContactLines(settings: ProposalSettings): string[] {
    const rows: Array<{ label: string; value: string | undefined }> = [
        { label: "WhatsApp", value: settings.pdf_contact_whatsapp },
        { label: "Facebook", value: settings.pdf_contact_facebook },
        { label: "E-mail", value: settings.pdf_contact_email },
        { label: "Site", value: settings.pdf_contact_website },
        { label: "Local", value: settings.pdf_contact_location },
    ];
    return rows
        .map((r) => ({
            label: r.label,
            value: typeof r.value === "string" ? r.value.trim() : "",
        }))
        .filter((r) => r.value.length > 0)
        .map((r) => `${r.label}  ${r.value}`);
}

export function hasPdfContactLines(settings: ProposalSettings): boolean {
    return buildPdfContactLines(settings).length > 0;
}

/** Cabeçalho em páginas internas — só se identidade no PDF estiver ativada em Configurações. */
export function pdfInnerRunningHeaderShouldShow(settings: ProposalSettings): boolean {
    if (settings.pdf_header_fill_from_settings !== true) return false;
    const company = settings.company_name?.trim();
    const logo = settings.company_logo_url?.trim();
    const sub = settings.company_header_subtitle?.trim();
    return Boolean(company || logo || sub || hasPdfContactLines(settings));
}

export function resolvePdfHeaderPrimaryColor(settings: ProposalSettings): string {
    return normalizeHex(settings.primary_color) ?? BRAND_DEFAULT_PRIMARY;
}

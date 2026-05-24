import { getDb, isTokenExpiredError, resetDb } from "@/lib/surreal";
import type { SmtpConfig } from "@/lib/smtp-config";
import { getAppBaseUrl, getSmtpConfig } from "@/lib/smtp-config";

export type ProposalMailRow = {
    app_public_url?: string;
    smtp_host?: string;
    smtp_port?: number;
    smtp_secure?: boolean | string | number;
    smtp_user?: string;
    smtp_pass?: string;
    smtp_from?: string;
    smtp_reply_to?: string;
    imap_host?: string;
    imap_user?: string;
    imap_pass?: string;
};

async function fetchMailRow(): Promise<ProposalMailRow | null> {
    try {
        const db = await getDb();
        const result = await db.query<[ProposalMailRow[]]>(
            "SELECT app_public_url, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from, smtp_reply_to, imap_host, imap_user, imap_pass FROM proposal_settings LIMIT 1",
        );
        return result[0]?.[0] ?? null;
    } catch (e) {
        console.error("fetchMailRow:", e);
        if (isTokenExpiredError(e)) resetDb();
        return null;
    }
}

/** URL pública para links de convite: banco → fallback .env */
export async function resolveInviteAppBaseUrl(): Promise<string | null> {
    const row = await fetchMailRow();
    const u = row?.app_public_url?.trim();
    if (u) return u.replace(/\/$/, "");
    return getAppBaseUrl();
}

/** SMTP para convites: banco (completo) → fallback .env */
export async function resolveSmtpConfigForInvite(): Promise<SmtpConfig | null> {
    const row = await fetchMailRow();
    const host = row?.smtp_host?.trim();
    const user = row?.smtp_user?.trim();
    const pass =
        row?.smtp_pass != null && String(row.smtp_pass).trim() !== ""
            ? String(row.smtp_pass).trim()
            : "";
    if (row && host && user && pass) {
        const port = Number(row.smtp_port) || 587;
        const s = row.smtp_secure;
        const secure =
            s === true || s === "true" || s === 1 || s === "1";
        const from = row.smtp_from?.trim() || user;
        const replyTo = row.smtp_reply_to?.trim() || undefined;
        return { host, port, secure, user, pass, from, replyTo };
    }
    return getSmtpConfig();
}

/** Linha de e-mail do banco (inclui campos IMAP opcionais). */
export async function fetchProposalMailRow(): Promise<ProposalMailRow | null> {
    return fetchMailRow();
}

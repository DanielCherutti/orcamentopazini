/**
 * Configuração SMTP para envio de convites (variáveis de ambiente — sem segredos no código).
 * Office 365 / Microsoft 365: host smtp.office365.com, porta 587, STARTTLS.
 */
export type SmtpConfig = {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
    /** Respostas do cliente (Reply-To); se vazio, usa o remetente From. */
    replyTo?: string;
};

export function getAppBaseUrl(): string | null {
    const raw =
        process.env.APP_URL?.trim() ||
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        "";
    if (!raw) return null;
    return raw.replace(/\/$/, "");
}

function stripEnvQuotes(raw: string): string {
    const t = raw.trim();
    if (
        (t.startsWith('"') && t.endsWith('"')) ||
        (t.startsWith("'") && t.endsWith("'"))
    ) {
        return t.slice(1, -1);
    }
    return t;
}

export function getSmtpConfig(): SmtpConfig | null {
    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();
    const rawPass = process.env.SMTP_PASS;
    if (rawPass === undefined) return null;
    const pass = stripEnvQuotes(String(rawPass));
    if (!host || !user || pass.length === 0) {
        return null;
    }
    const port = Number(process.env.SMTP_PORT?.trim() || "587");
    const secure =
        process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1";
    const from =
        process.env.EMAIL_FROM?.trim() ||
        process.env.SMTP_FROM?.trim() ||
        user;
    const replyTo = process.env.SMTP_REPLY_TO?.trim() || undefined;
    return { host, port, secure, user, pass, from, replyTo };
}

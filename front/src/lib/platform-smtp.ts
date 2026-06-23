import type { SmtpConfig } from "@/lib/smtp-config";
import { getAppBaseUrl, getSmtpConfig } from "@/lib/smtp-config";

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

/** SMTP para convites da plataforma: PLATFORM_SMTP_* → fallback SMTP_* / .env */
export function getPlatformSmtpConfig(): SmtpConfig | null {
    const host =
        process.env.PLATFORM_SMTP_HOST?.trim() || process.env.SMTP_HOST?.trim();
    const user =
        process.env.PLATFORM_SMTP_USER?.trim() || process.env.SMTP_USER?.trim();
    const rawPass = process.env.PLATFORM_SMTP_PASS ?? process.env.SMTP_PASS;
    if (rawPass === undefined) return getSmtpConfig();
    const pass = stripEnvQuotes(String(rawPass));
    if (!host || !user || pass.length === 0) {
        return getSmtpConfig();
    }
    const port = Number(
        process.env.PLATFORM_SMTP_PORT?.trim() ||
            process.env.SMTP_PORT?.trim() ||
            "587",
    );
    const secureRaw =
        process.env.PLATFORM_SMTP_SECURE?.trim() || process.env.SMTP_SECURE?.trim();
    const secure = secureRaw === "true" || secureRaw === "1";
    const from =
        process.env.PLATFORM_SMTP_FROM?.trim() ||
        process.env.EMAIL_FROM?.trim() ||
        process.env.SMTP_FROM?.trim() ||
        user;
    const replyTo =
        process.env.PLATFORM_SMTP_REPLY_TO?.trim() ||
        process.env.SMTP_REPLY_TO?.trim() ||
        undefined;
    return { host, port, secure, user, pass, from, replyTo };
}

/** URL pública para links de convite da plataforma. */
export function getPlatformAppBaseUrl(): string | null {
    const raw =
        process.env.PLATFORM_APP_URL?.trim() ||
        process.env.APP_URL?.trim() ||
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        "";
    if (!raw) return getAppBaseUrl();
    return raw.replace(/\/$/, "");
}

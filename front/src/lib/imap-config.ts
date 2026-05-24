import type { SmtpConfig } from "@/lib/smtp-config";
import { fetchProposalMailRow, resolveSmtpConfigForInvite } from "@/lib/proposal-mail-settings";

export type ImapConfig = {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
};

export function resolveImapHostFromSmtp(smtpHost: string): string {
    const h = smtpHost.toLowerCase();
    if (h.includes("office365") || h.includes("outlook") || h.includes("hotmail")) {
        return "outlook.office365.com";
    }
    if (h.includes("gmail")) {
        return "imap.gmail.com";
    }
    if (h.startsWith("smtp.")) {
        return `imap.${h.slice(5)}`;
    }
    return process.env.IMAP_HOST?.trim() || "outlook.office365.com";
}

/** Usuário IMAP: e-mail completo (From costuma ser mais confiável que alias curto no SMTP). */
export function resolveImapLoginUser(smtp: SmtpConfig, overrideUser?: string): string {
    const custom = overrideUser?.trim();
    if (custom) return custom;
    const user = smtp.user.trim();
    const from = smtp.from.trim();
    if (user.includes("@")) return user;
    if (from.includes("@")) return from;
    return user;
}

export async function resolveImapConfig(): Promise<ImapConfig | null> {
    const smtp = await resolveSmtpConfigForInvite();
    if (!smtp) return null;

    const row = await fetchProposalMailRow();
    const host =
        process.env.IMAP_HOST?.trim() ||
        row?.imap_host?.trim() ||
        resolveImapHostFromSmtp(smtp.host);
    const user = resolveImapLoginUser(
        smtp,
        process.env.IMAP_USER?.trim() || row?.imap_user?.trim()
    );
    const rowImapPass =
        row?.imap_pass != null && String(row.imap_pass).trim() !== ""
            ? String(row.imap_pass).trim()
            : "";
    const pass =
        process.env.IMAP_PASS?.trim() ||
        rowImapPass ||
        smtp.pass;

    if (!user || !pass) return null;

    const port = Number(process.env.IMAP_PORT?.trim() || "993");
    const secure = process.env.IMAP_SECURE !== "false" && process.env.IMAP_SECURE !== "0";

    return {
        host,
        port,
        secure,
        user,
        pass,
    };
}

export function smtpFromAddress(cfg: SmtpConfig): string {
    return cfg.from;
}

/** Pastas consultadas ao buscar respostas (INBOX + enviados, onde cai resposta “para si mesmo”). */
export function resolveImapMailboxes(imapHost: string): string[] {
    const h = imapHost.toLowerCase();
    if (h.includes("gmail")) {
        return ["INBOX", "[Gmail]/Sent Mail"];
    }
    if (h.includes("office365") || h.includes("outlook")) {
        return ["INBOX", "Sent Items"];
    }
    return ["INBOX", "Sent"];
}

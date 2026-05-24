import { resolveImapConfig } from "@/lib/imap-config";
import { resolveSmtpConfigForInvite } from "@/lib/proposal-mail-settings";

export function isLikelyNoReplyAddress(email: string): boolean {
    const local = email.split("@")[0]?.toLowerCase().replace(/\./g, "") ?? "";
    return (
        local === "noreply" ||
        local === "donotreply" ||
        local.startsWith("no-reply") ||
        local.startsWith("naoresponda")
    );
}

export async function resolveBudgetEmailMailboxInfo(): Promise<{
    from: string;
    replyTo: string;
    imapHost: string;
    imapUser: string;
    isNoReplyFrom: boolean;
} | null> {
    const smtp = await resolveSmtpConfigForInvite();
    const imap = await resolveImapConfig();
    if (!smtp || !imap) return null;

    const from = smtp.from.trim().toLowerCase();
    const replyTo = (smtp.replyTo?.trim() || smtp.from).toLowerCase();

    return {
        from,
        replyTo,
        imapHost: imap.host,
        imapUser: imap.user.toLowerCase(),
        isNoReplyFrom: isLikelyNoReplyAddress(from),
    };
}

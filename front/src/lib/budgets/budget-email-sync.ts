import { simpleParser, type ParsedMail } from "mailparser";
import type { SearchObject } from "imapflow";
import { connectImapClient } from "@/lib/imap-connect";
import { formatImapSyncError } from "@/lib/imap-auth-errors";
import { resolveImapConfig, smtpFromAddress } from "@/lib/imap-config";
import { resolveSyncMailboxes } from "@/lib/imap-mailboxes";
import { resolveSmtpConfigForInvite } from "@/lib/proposal-mail-settings";
import { extractThreadTokenFromSubject } from "@/lib/budgets/budget-email-thread-token";
import {
    findThreadByPublicToken,
    insertBudgetEmailMessage,
    messageExistsByInternetId,
    touchThreadSync,
    normalizeInternetMessageId,
} from "@/lib/budgets/budget-email-store";
import {
    searchRecentUidsFallback,
    searchRelevantUids,
} from "@/lib/budgets/budget-email-imap-search";
import {
    buildGlobalSyncContext,
    buildSyncContext,
    envelopeMightMatch,
    resolveSinceDate,
    type EmailSyncContext,
} from "@/lib/budgets/budget-email-sync-context";
import { canonicalTableRecordId } from "@/lib/surreal-record-ids";

export type { BudgetSyncContext, EmailSyncContext } from "@/lib/budgets/budget-email-sync-context";

type SyncOk = {
    ok: true;
    imported: number;
    importedByBudget: Record<string, number>;
};

type SyncFail = { ok: false; error: string };

type InboundMatch = {
    threadId: string;
    budgetId: string;
    participantEmail: string;
};

function extractEmailFromText(text: string): string | undefined {
    const trimmed = text.trim();
    if (!trimmed) return undefined;
    const angle = trimmed.match(/<([^>]+)>/);
    if (angle?.[1]?.includes("@")) return angle[1].trim().toLowerCase();
    const plain = trimmed.match(/[^\s<>]+@[^\s<>]+/);
    return plain?.[0]?.toLowerCase();
}

/** mailparser: EmailAddress, AddressObject ({ value: EmailAddress[] }), string, etc. */
function emailAddressFromField(field: unknown): string | undefined {
    if (!field) return undefined;
    if (typeof field === "string") return extractEmailFromText(field);

    if (typeof field !== "object") return undefined;

    const row = field as Record<string, unknown>;

    if (typeof row.address === "string") {
        return row.address.trim().toLowerCase();
    }

    if (Array.isArray(row.value)) {
        for (const entry of row.value) {
            const addr = emailAddressFromField(entry);
            if (addr) return addr;
        }
    }

    if (typeof row.value === "string") {
        return extractEmailFromText(row.value);
    }

    if (typeof row.text === "string") {
        return extractEmailFromText(row.text);
    }

    if (Array.isArray(row.group)) {
        for (const entry of row.group) {
            const addr = emailAddressFromField(entry);
            if (addr) return addr;
        }
    }

    return undefined;
}

function parseReferences(refs: string | string[] | undefined): string[] {
    if (!refs) return [];
    const raw = Array.isArray(refs) ? refs.join(" ") : refs;
    const matches = raw.match(/<[^>]+>/g) ?? [];
    return matches.map((m) => normalizeInternetMessageId(m));
}

async function resolveThreadForInbound(
    ctx: EmailSyncContext,
    subject: string,
    inReplyTo: string | undefined,
    references: string[],
    fromEmail: string
): Promise<InboundMatch | null> {
    const token = extractThreadTokenFromSubject(subject);
    if (token) {
        const thread = await findThreadByPublicToken(token);
        if (thread) {
            const budgetKey = canonicalTableRecordId("budget", thread.budget_id);
            if (ctx.scopeBudgetKey && budgetKey !== ctx.scopeBudgetKey) {
                return null;
            }
            return {
                threadId: thread.id,
                budgetId: thread.budget_id,
                participantEmail: thread.participant_email,
            };
        }
    }

    const replyId = inReplyTo ? normalizeInternetMessageId(inReplyTo) : "";
    const refSet = new Set(references.map(normalizeInternetMessageId));

    const matchesByHeaders = (thread: { id: string; budget_id: string; participant_email: string }) => {
        if (replyId && ctx.knownIds.has(replyId)) return true;
        for (const ref of refSet) {
            if (ctx.knownIds.has(ref)) return true;
        }
        return false;
    };

    for (const thread of ctx.threads) {
        if (matchesByHeaders(thread)) {
            return {
                threadId: thread.id,
                budgetId: thread.budget_id,
                participantEmail: thread.participant_email,
            };
        }
    }

    const fromNorm = fromEmail.trim().toLowerCase();
    const participantThread = ctx.threads.find((t) => t.participant_email === fromNorm);
    if (!participantThread) return null;

    const isReplySubject = /^re:\s*/i.test(subject.trim());
    if (token || replyId || refSet.size > 0 || isReplySubject) {
        return {
            threadId: participantThread.id,
            budgetId: participantThread.budget_id,
            participantEmail: participantThread.participant_email,
        };
    }

    if (ctx.threadIdsWithOutbound.has(participantThread.id)) {
        return {
            threadId: participantThread.id,
            budgetId: participantThread.budget_id,
            participantEmail: participantThread.participant_email,
        };
    }

    return null;
}

function extractFromAddress(
    envelopeFrom: { address?: string }[] | undefined,
    parsed: ParsedMail
): string {
    const fromParsed = parsed.from;
    if (fromParsed) {
        const list = Array.isArray(fromParsed) ? fromParsed : [fromParsed];
        const addr = emailAddressFromField(list[0]);
        if (addr) return addr;
    }
    return envelopeFrom?.[0]?.address?.toLowerCase() ?? "";
}

function extractToAddress(parsed: ParsedMail, fallback: string): string {
    const to = parsed.to;
    if (!to || typeof to !== "object") return fallback;
    if (Array.isArray(to)) {
        return emailAddressFromField(to[0]) ?? fallback;
    }
    return emailAddressFromField(to) ?? fallback;
}

async function processInboundMessage(
    ctx: EmailSyncContext,
    ourAddress: string,
    parsed: ParsedMail,
    envelopeFrom: { address?: string }[] | undefined,
    importedByBudget: Record<string, number>
): Promise<boolean> {
    const fromAddr = extractFromAddress(envelopeFrom, parsed);
    if (!fromAddr) return false;

    const internetId = parsed.messageId
        ? normalizeInternetMessageId(parsed.messageId)
        : "";
    if (internetId && (await messageExistsByInternetId(internetId))) {
        return false;
    }

    const subject = parsed.subject ?? "";
    const inReplyTo = parsed.inReplyTo
        ? normalizeInternetMessageId(
              Array.isArray(parsed.inReplyTo)
                  ? String(parsed.inReplyTo[0])
                  : String(parsed.inReplyTo)
          )
        : undefined;
    const references = parseReferences(parsed.references);

    const match = await resolveThreadForInbound(
        ctx,
        subject,
        inReplyTo,
        references,
        fromAddr
    );
    if (!match) return false;

    const inboundFrom =
        fromAddr === ourAddress ? match.participantEmail : fromAddr;

    const bodyText =
        parsed.text?.trim() ||
        parsed.textAsHtml?.replace(/<[^>]+>/g, " ").trim() ||
        "(sem conteúdo de texto)";

    const toAddr = extractToAddress(parsed, ourAddress);

    await insertBudgetEmailMessage({
        threadId: match.threadId,
        budgetId: match.budgetId,
        direction: "in",
        fromEmail: inboundFrom,
        toEmail: toAddr,
        subject: String(subject),
        bodyText: bodyText.slice(0, 50_000),
        internetMessageId: internetId || undefined,
        inReplyTo,
        hasPdfAttachment: false,
        sentAt: parsed.date?.toISOString() ?? new Date().toISOString(),
    });
    await touchThreadSync(match.threadId);
    importedByBudget[match.budgetId] = (importedByBudget[match.budgetId] ?? 0) + 1;
    return true;
}

async function runImapSync(ctx: EmailSyncContext): Promise<SyncOk | SyncFail> {
    const imapCfg = await resolveImapConfig();
    const smtpCfg = await resolveSmtpConfigForInvite();
    if (!imapCfg || !smtpCfg) {
        return {
            ok: false,
            error: "IMAP/SMTP não configurado. Use as mesmas credenciais em Configurações da empresa.",
        };
    }

    if (ctx.threads.length === 0) {
        return { ok: true, imported: 0, importedByBudget: {} };
    }

    const ourAddress = smtpFromAddress(smtpCfg).toLowerCase();
    const since = resolveSinceDate(ctx.threads);
    const importedByBudget: Record<string, number> = {};
    let imported = 0;
    let client;

    try {
        client = await connectImapClient(imapCfg);
        const mailboxes = await resolveSyncMailboxes(client);
        const uidQuery = (uids: number[]): SearchObject => ({ uid: uids.join(",") });

        for (const mailbox of mailboxes) {
            try {
                const lock = await client.getMailboxLock(mailbox);
                try {
                    let uids: number[];
                    try {
                        uids = await searchRelevantUids(client, ctx, since);
                    } catch (searchErr) {
                        console.warn(
                            "[budget-email-sync] busca filtrada falhou, usando fallback:",
                            searchErr
                        );
                        uids = await searchRecentUidsFallback(client, since);
                    }

                    if (uids.length === 0) continue;

                    for await (const msg of client.fetch(uidQuery(uids), {
                        source: true,
                        envelope: true,
                    })) {
                        const fromAddr =
                            msg.envelope?.from?.[0]?.address?.toLowerCase() ?? "";
                        const subject = msg.envelope?.subject ?? "";
                        if (!envelopeMightMatch(ctx, fromAddr, subject)) {
                            continue;
                        }

                        if (!msg.source) continue;

                        const parsed: ParsedMail = await simpleParser(msg.source);
                        let added = false;
                        try {
                            added = await processInboundMessage(
                                ctx,
                                ourAddress,
                                parsed,
                                msg.envelope?.from,
                                importedByBudget
                            );
                        } catch (msgErr) {
                            console.warn("[budget-email-sync] mensagem ignorada:", msgErr);
                        }
                        if (added) imported++;
                    }
                } finally {
                    lock.release();
                }
            } catch (mailboxErr) {
                const missing =
                    mailboxErr &&
                    typeof mailboxErr === "object" &&
                    (mailboxErr as { mailboxMissing?: boolean }).mailboxMissing;
                if (!missing) {
                    console.warn(`[budget-email-sync] pasta ${mailbox} ignorada:`, mailboxErr);
                }
            }
        }

        for (const thread of ctx.threads) {
            await touchThreadSync(thread.id);
        }

        await client.logout();
        return { ok: true, imported, importedByBudget };
    } catch (e) {
        console.error("[budget-email-sync]", e);
        if (client) {
            try {
                await client.logout();
            } catch {
                /* ignore */
            }
        }
        return {
            ok: false,
            error: formatImapSyncError(imapCfg.host, e),
        };
    }
}

export async function syncBudgetEmailReplies(
    budgetId: string
): Promise<{ ok: true; imported: number } | { ok: false; error: string }> {
    const ctx = await buildSyncContext(budgetId);
    const result = await runImapSync(ctx);
    if (!result.ok) return result;
    return { ok: true, imported: result.imported };
}

export async function syncAllBudgetEmailReplies(): Promise<SyncOk | SyncFail> {
    const ctx = await buildGlobalSyncContext();
    return runImapSync(ctx);
}

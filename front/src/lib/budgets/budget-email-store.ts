import { Table } from "surrealdb";
import { getDb, isTokenExpiredError, resetDb } from "@/lib/surreal";
import { requireRecordId, recordIdToString } from "@/lib/surreal-record-ids";
import { generateThreadPublicToken } from "@/lib/budgets/budget-email-thread-token";

export type BudgetEmailMessageRow = {
    id: string;
    thread_id: string;
    budget_id: string;
    direction: "out" | "in";
    from_email: string;
    to_email: string;
    subject: string;
    body_text: string;
    internet_message_id?: string;
    in_reply_to?: string;
    has_pdf_attachment?: boolean;
    sent_at: string;
};

export type BudgetEmailThreadRow = {
    id: string;
    budget_id: string;
    participant_email: string;
    public_token: string;
    last_synced_at?: string;
};

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

export function normalizeInternetMessageId(id: string): string {
    return id.replace(/^<|>$/g, "").trim().toLowerCase();
}

function serializeMessage(row: Record<string, unknown>): BudgetEmailMessageRow {
    return {
        id: recordIdToString(row.id),
        thread_id: recordIdToString(row.thread_id),
        budget_id: recordIdToString(row.budget_id),
        direction: row.direction === "in" ? "in" : "out",
        from_email: String(row.from_email ?? ""),
        to_email: String(row.to_email ?? ""),
        subject: String(row.subject ?? ""),
        body_text: String(row.body_text ?? ""),
        internet_message_id: row.internet_message_id
            ? String(row.internet_message_id)
            : undefined,
        in_reply_to: row.in_reply_to ? String(row.in_reply_to) : undefined,
        has_pdf_attachment: Boolean(row.has_pdf_attachment),
        sent_at: String(row.sent_at ?? row.created_at ?? new Date().toISOString()),
    };
}

export async function getOrCreateThread(
    budgetId: string,
    participantEmail: string
): Promise<BudgetEmailThreadRow> {
    const db = await getDb();
    const budgetRecordId = requireRecordId("budget", budgetId);
    const participant = normalizeEmail(participantEmail);

    const existing = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM budget_email_thread
         WHERE budget_id = $budgetId AND participant_email = $email
         LIMIT 1`,
        { budgetId: budgetRecordId, email: participant }
    );
    const row = existing[0]?.[0];
    if (row?.id) {
        return {
            id: recordIdToString(row.id),
            budget_id: budgetId,
            participant_email: participant,
            public_token: String(row.public_token ?? ""),
            last_synced_at: row.last_synced_at ? String(row.last_synced_at) : undefined,
        };
    }

    const token = generateThreadPublicToken().toLowerCase();
    const createdRaw = await db.create(new Table("budget_email_thread")).content({
        budget_id: budgetRecordId,
        participant_email: participant,
        public_token: token,
        created_at: new Date().toISOString(),
    });
    const created = Array.isArray(createdRaw) ? createdRaw[0] : createdRaw;
    return {
        id: recordIdToString(created.id),
        budget_id: budgetId,
        participant_email: participant,
        public_token: token,
    };
}

export async function listThreadsForBudget(budgetId: string): Promise<BudgetEmailThreadRow[]> {
    const db = await getDb();
    const budgetRecordId = requireRecordId("budget", budgetId);
    const res = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM budget_email_thread WHERE budget_id = $budgetId`,
        { budgetId: budgetRecordId }
    );
    return (res[0] || []).map((row) => ({
        id: recordIdToString(row.id),
        budget_id: budgetId,
        participant_email: String(row.participant_email ?? ""),
        public_token: String(row.public_token ?? ""),
        last_synced_at: row.last_synced_at ? String(row.last_synced_at) : undefined,
    }));
}

export async function listMessagesForBudget(budgetId: string): Promise<BudgetEmailMessageRow[]> {
    const db = await getDb();
    const budgetRecordId = requireRecordId("budget", budgetId);
    const res = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM budget_email_message
         WHERE budget_id = $budgetId
         ORDER BY sent_at ASC`,
        { budgetId: budgetRecordId }
    );
    return (res[0] || []).map(serializeMessage);
}

/** Threads deste orçamento que já têm pelo menos um envio (para casar respostas). */
export async function listThreadIdsWithOutboundForBudget(budgetId: string): Promise<Set<string>> {
    const db = await getDb();
    const budgetRecordId = requireRecordId("budget", budgetId);
    const res = await db.query<[Array<{ thread_id: unknown }>]>(
        `SELECT thread_id FROM budget_email_message
         WHERE budget_id = $budgetId AND direction = 'out'
         GROUP BY thread_id`,
        { budgetId: budgetRecordId }
    );
    const ids = new Set<string>();
    for (const row of res[0] || []) {
        if (row.thread_id) ids.add(recordIdToString(row.thread_id));
    }
    return ids;
}

export async function listMessagesForThread(threadId: string): Promise<BudgetEmailMessageRow[]> {
    const db = await getDb();
    const threadRecordId = requireRecordId("budget_email_thread", threadId);
    const res = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM budget_email_message
         WHERE thread_id = $threadId
         ORDER BY sent_at ASC`,
        { threadId: threadRecordId }
    );
    return (res[0] || []).map(serializeMessage);
}

export async function findThreadByPublicToken(
    token: string
): Promise<(BudgetEmailThreadRow & { budget_id: string }) | null> {
    const threadToken = token.trim().toLowerCase();
    if (!/^[a-z0-9]{6,16}$/.test(threadToken)) return null;

    try {
        const db = await getDb();
        const res = await db.query<[Array<Record<string, unknown>>]>(
            `SELECT * FROM budget_email_thread
             WHERE public_token = $threadToken
                OR string::lowercase(public_token) = $threadToken
             LIMIT 1`,
            { threadToken }
        );
        const row = res[0]?.[0];
        if (!row?.id) return null;
        return {
            id: recordIdToString(row.id),
            budget_id: recordIdToString(row.budget_id),
            participant_email: String(row.participant_email ?? ""),
            public_token: String(row.public_token ?? ""),
            last_synced_at: row.last_synced_at ? String(row.last_synced_at) : undefined,
        };
    } catch (e) {
        console.error("[findThreadByPublicToken]", e);
        return null;
    }
}

export async function messageExistsByInternetId(internetMessageId: string): Promise<boolean> {
    const normalized = normalizeInternetMessageId(internetMessageId);
    if (!normalized) return false;
    const db = await getDb();
    const res = await db.query<[Array<{ id: unknown }>]>(
        `SELECT id FROM budget_email_message
         WHERE internet_message_id = $imid
            OR internet_message_id = $bracketed
         LIMIT 1`,
        { imid: normalized, bracketed: `<${normalized}>` }
    );
    return Boolean(res[0]?.[0]?.id);
}

export async function insertBudgetEmailMessage(input: {
    threadId: string;
    budgetId: string;
    direction: "out" | "in";
    fromEmail: string;
    toEmail: string;
    subject: string;
    bodyText: string;
    internetMessageId?: string;
    inReplyTo?: string;
    hasPdfAttachment?: boolean;
    sentAt?: string;
}): Promise<BudgetEmailMessageRow> {
    const db = await getDb();
    const threadRecordId = requireRecordId("budget_email_thread", input.threadId);
    const budgetRecordId = requireRecordId("budget", input.budgetId);
    const sentAt = input.sentAt ?? new Date().toISOString();

    const createdRaw = await db.create(new Table("budget_email_message")).content({
        thread_id: threadRecordId,
        budget_id: budgetRecordId,
        direction: input.direction,
        from_email: input.fromEmail,
        to_email: input.toEmail,
        subject: input.subject,
        body_text: input.bodyText,
        ...(input.internetMessageId
            ? { internet_message_id: normalizeInternetMessageId(input.internetMessageId) }
            : {}),
        ...(input.inReplyTo
            ? { in_reply_to: normalizeInternetMessageId(input.inReplyTo) }
            : {}),
        has_pdf_attachment: Boolean(input.hasPdfAttachment),
        sent_at: sentAt,
        created_at: new Date().toISOString(),
    });
    const created = Array.isArray(createdRaw) ? createdRaw[0] : createdRaw;
    return serializeMessage({ ...created, sent_at: sentAt });
}

export async function touchThreadSync(threadId: string): Promise<void> {
    const db = await getDb();
    try {
        const threadRecordId = requireRecordId("budget_email_thread", threadId);
        await db.update(threadRecordId).merge({ last_synced_at: new Date().toISOString() });
    } catch (e) {
        if (isTokenExpiredError(e)) resetDb();
    }
}

export async function collectKnownMessageIdsForBudget(budgetId: string): Promise<Set<string>> {
    const messages = await listMessagesForBudget(budgetId);
    const ids = new Set<string>();
    for (const m of messages) {
        if (m.internet_message_id) {
            ids.add(normalizeInternetMessageId(m.internet_message_id));
        }
        if (m.in_reply_to) {
            ids.add(normalizeInternetMessageId(m.in_reply_to));
        }
    }
    return ids;
}

/** Threads que já tiveram pelo menos um envio (candidatas a resposta). */
export async function listThreadsWithOutbound(): Promise<BudgetEmailThreadRow[]> {
    const db = await getDb();
    const res = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM budget_email_thread
         WHERE id IN (
             SELECT VALUE thread_id FROM budget_email_message
             WHERE direction = 'out'
             GROUP BY thread_id
         )`
    );
    return (res[0] || []).map((row) => ({
        id: recordIdToString(row.id),
        budget_id: recordIdToString(row.budget_id),
        participant_email: String(row.participant_email ?? ""),
        public_token: String(row.public_token ?? ""),
        last_synced_at: row.last_synced_at ? String(row.last_synced_at) : undefined,
    }));
}

export async function hasAnyOutboundBudgetEmail(): Promise<boolean> {
    const db = await getDb();
    const res = await db.query<[Array<{ id: unknown }>]>(
        `SELECT id FROM budget_email_message WHERE direction = 'out' LIMIT 1`
    );
    return Boolean(res[0]?.[0]?.id);
}

export async function collectAllKnownMessageIds(): Promise<Set<string>> {
    const db = await getDb();
    const res = await db.query<
        [Array<{ internet_message_id?: string; in_reply_to?: string }>]
    >(
        `SELECT internet_message_id, in_reply_to FROM budget_email_message
         WHERE internet_message_id != NONE OR in_reply_to != NONE`
    );
    const ids = new Set<string>();
    for (const row of res[0] || []) {
        if (row.internet_message_id) {
            ids.add(normalizeInternetMessageId(String(row.internet_message_id)));
        }
        if (row.in_reply_to) {
            ids.add(normalizeInternetMessageId(String(row.in_reply_to)));
        }
    }
    return ids;
}

export async function listBudgetCodesByIds(
    budgetIds: string[]
): Promise<Map<string, string>> {
    const unique = [...new Set(budgetIds.map((id) => id.trim()).filter(Boolean))];
    const out = new Map<string, string>();
    if (unique.length === 0) return out;

    const db = await getDb();
    const recordIds = unique.map((id) => requireRecordId("budget", id));
    const res = await db.query<[Array<{ id: unknown; code?: string }>]>(
        `SELECT id, code FROM budget WHERE id IN $ids`,
        { ids: recordIds }
    );
    for (const row of res[0] || []) {
        const id = recordIdToString(row.id);
        const code = row.code?.trim();
        if (id && code) out.set(id, code);
    }
    return out;
}

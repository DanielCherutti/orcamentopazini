import type { ImapFlow, SearchObject } from "imapflow";
import type { EmailSyncContext } from "@/lib/budgets/budget-email-sync-context";

/** Limite de mensagens buscadas por pasta (evita travar em caixas enormes). */
const MAX_UIDS_PER_MAILBOX = 500;

/** Tamanho de cada lote OR na busca IMAP (limite de alguns servidores). */
const OR_CLAUSE_BATCH = 10;

function addUids(target: Set<number>, found: number[] | false | undefined): void {
    if (!found) return;
    for (const uid of found) target.add(uid);
}

function capNewestUids(uids: number[]): number[] {
    if (uids.length <= MAX_UIDS_PER_MAILBOX) return uids;
    return [...uids].sort((a, b) => b - a).slice(0, MAX_UIDS_PER_MAILBOX);
}

function buildOrClauses(ctx: EmailSyncContext, since: Date): SearchObject[] {
    const clauses: SearchObject[] = [];

    for (const email of ctx.participantEmails) {
        clauses.push({ from: email, since });
    }

    for (const thread of ctx.threads) {
        clauses.push({ subject: `PZ:${thread.public_token}`, since });
    }

    return clauses;
}

/**
 * Busca no servidor IMAP só mensagens que podem ser resposta deste orçamento
 * (remetente = participante ou assunto com token [PZ:…]).
 */
export async function searchRelevantUids(
    client: ImapFlow,
    ctx: EmailSyncContext,
    since: Date
): Promise<number[]> {
    if (ctx.threads.length === 0) return [];

    const clauses = buildOrClauses(ctx, since);
    if (clauses.length === 0) return [];

    const uidSet = new Set<number>();

    for (let i = 0; i < clauses.length; i += OR_CLAUSE_BATCH) {
        const batch = clauses.slice(i, i + OR_CLAUSE_BATCH);
        const query: SearchObject =
            batch.length === 1 ? batch[0]! : { or: batch };
        const found = await client.search(query, { uid: true });
        addUids(uidSet, found);
    }

    return capNewestUids([...uidSet]);
}

/** Fallback quando o servidor rejeita buscas compostas: janela curta + limite rígido. */
export async function searchRecentUidsFallback(
    client: ImapFlow,
    since: Date
): Promise<number[]> {
    const found = await client.search({ since }, { uid: true });
    return capNewestUids(found ? [...found] : []);
}

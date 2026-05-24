import type { ImapFlow } from "imapflow";

const SENT_CANDIDATES = [
    "[Gmail]/Sent Mail",
    "Sent Items",
    "Sent",
    "Itens Enviados",
];

/**
 * INBOX + pasta de enviados existente no servidor (evita erro em contas não-Gmail).
 */
export async function resolveSyncMailboxes(client: ImapFlow): Promise<string[]> {
    const mailboxes = new Set<string>(["INBOX"]);

    try {
        const list = await client.list();
        const paths = new Set(list.map((entry) => entry.path));

        for (const candidate of SENT_CANDIDATES) {
            if (paths.has(candidate)) {
                mailboxes.add(candidate);
                return [...mailboxes];
            }
        }

        const byFlag = list.find(
            (entry) =>
                entry.specialUse === "\\Sent" ||
                /\bsent\b/i.test(entry.path) ||
                /enviados/i.test(entry.path)
        );
        if (byFlag?.path) {
            mailboxes.add(byFlag.path);
        }
    } catch {
        /* INBOX only */
    }

    return [...mailboxes];
}

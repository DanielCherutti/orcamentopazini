import { ImapFlow } from "imapflow";
import type { ImapConfig } from "@/lib/imap-config";

function isAuthFailure(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;
    const o = err as Record<string, unknown>;
    return o.authenticationFailed === true;
}

/**
 * Conecta ao IMAP; em falha de autenticação tenta de novo com LOGIN (alguns servidores rejeitam PLAIN).
 */
export async function connectImapClient(cfg: ImapConfig): Promise<ImapFlow> {
    const base = {
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        logger: false as const,
    };

    const attempts: Array<{ loginMethod?: "LOGIN" | "AUTH=PLAIN" }> = [
        {},
        { loginMethod: "LOGIN" },
        { loginMethod: "AUTH=PLAIN" },
    ];

    let lastErr: unknown;
    for (const attempt of attempts) {
        const client = new ImapFlow({
            ...base,
            auth: {
                user: cfg.user,
                pass: cfg.pass,
                ...attempt,
            },
        });
        try {
            await client.connect();
            return client;
        } catch (e) {
            lastErr = e;
            try {
                await client.logout();
            } catch {
                /* ignore */
            }
            if (!isAuthFailure(e)) throw e;
        }
    }
    throw lastErr;
}

export async function testImapConnection(
    cfg: import("@/lib/imap-config").ImapConfig
): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
        const client = await connectImapClient(cfg);
        await client.logout();
        return { ok: true };
    } catch (e) {
        const { formatImapSyncError } = await import("@/lib/imap-auth-errors");
        return { ok: false, error: formatImapSyncError(cfg.host, e) };
    }
}

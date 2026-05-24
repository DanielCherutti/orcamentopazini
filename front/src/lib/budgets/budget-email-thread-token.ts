const TOKEN_RE = /\[PZ:([a-z0-9]{6,16})\]/i;

export function generateThreadPublicToken(): string {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

export function appendThreadTokenToSubject(subject: string, token: string): string {
    const base = subject.replace(TOKEN_RE, "").trim();
    return `${base} [PZ:${token}]`.trim();
}

export function extractThreadTokenFromSubject(subject: string): string | null {
    const m = subject.match(TOKEN_RE);
    return m?.[1]?.toLowerCase() ?? null;
}

export function stripThreadTokenFromSubject(subject: string): string {
    return subject.replace(TOKEN_RE, "").trim();
}

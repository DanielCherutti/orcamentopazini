const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidRecipientEmail(email: string): boolean {
    return EMAIL_RE.test(email.trim().toLowerCase());
}

/** Separa vários e-mails (vírgula, ponto e vírgula, espaço ou quebra de linha). */
export function parseRecipientList(raw: string): string[] {
    const parts = raw
        .split(/[,;\n\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

    const seen = new Set<string>();
    const out: string[] = [];
    for (const email of parts) {
        if (seen.has(email)) continue;
        seen.add(email);
        out.push(email);
    }
    return out;
}

export function dedupeRecipientEmails(
    emails: string[],
    exclude: Set<string> = new Set()
): string[] {
    const seen = new Set(exclude);
    const out: string[] = [];
    for (const raw of emails) {
        const email = raw.trim().toLowerCase();
        if (!email || seen.has(email)) continue;
        seen.add(email);
        out.push(email);
    }
    return out;
}

export function validateRecipientList(
    raw: string
): { ok: true; emails: string[] } | { ok: false; error: string } {
    return validateEmailsArray(parseRecipientList(raw));
}

export function validateEmailsArray(
    emails: string[]
): { ok: true; emails: string[] } | { ok: false; error: string } {
    const list = dedupeRecipientEmails(emails);
    if (list.length === 0) {
        return { ok: false, error: "Informe ao menos um e-mail do destinatário." };
    }
    const invalid = list.filter((e) => !isValidRecipientEmail(e));
    if (invalid.length > 0) {
        return {
            ok: false,
            error:
                invalid.length === 1
                    ? `E-mail inválido: ${invalid[0]}`
                    : `E-mails inválidos: ${invalid.join(", ")}`,
        };
    }
    return { ok: true, emails: list };
}

export function validateToAndCc(
    toEmails: string[],
    ccEmails: string[]
): { ok: true; to: string[]; cc: string[] } | { ok: false; error: string } {
    const toParsed = validateEmailsArray(toEmails);
    if (!toParsed.ok) return toParsed;

    const ccDeduped = dedupeRecipientEmails(ccEmails, new Set(toParsed.emails));
    const ccParsed =
        ccDeduped.length === 0
            ? { ok: true as const, emails: [] as string[] }
            : validateEmailsArray(ccDeduped);
    if (!ccParsed.ok) return ccParsed;

    const overlap = ccParsed.emails.filter((e) => toParsed.emails.includes(e));
    if (overlap.length > 0) {
        return {
            ok: false,
            error: `O mesmo e-mail não pode estar em Para e Cc: ${overlap.join(", ")}`,
        };
    }

    return { ok: true, to: toParsed.emails, cc: ccParsed.emails };
}

export function formatRecipientList(emails: string[]): string {
    return emails.join(", ");
}

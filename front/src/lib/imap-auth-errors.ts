function isImapAuthFailure(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;
    const o = err as Record<string, unknown>;
    if (o.authenticationFailed === true) return true;
    const text = String(o.responseText ?? o.message ?? "").toLowerCase();
    return text.includes("authenticate failed") || text.includes("authentication failure");
}

export function formatImapAuthError(imapHost: string): string {
    const h = imapHost.toLowerCase();

    if (h.includes("gmail")) {
        return "Não foi possível acessar a caixa Gmail. Revise o login em Configurações → E-mail.";
    }

    if (h.includes("office365") || h.includes("outlook")) {
        return "Não foi possível acessar a caixa Microsoft 365. Use o e-mail do Reply-To e peça ao TI para habilitar IMAP.";
    }

    return "Não foi possível acessar a caixa de e-mail. Revise o login em Configurações → E-mail.";
}

export function formatImapSyncError(imapHost: string, err: unknown): string {
    if (isImapAuthFailure(err)) {
        return formatImapAuthError(imapHost);
    }
    return "Não foi possível buscar respostas. Tente de novo ou revise Configurações → E-mail.";
}

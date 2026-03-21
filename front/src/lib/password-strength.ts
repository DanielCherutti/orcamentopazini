/**
 * Regras de senha fortes (cliente + servidor).
 * Não importar nada de Node aqui — seguro para o bundle do browser.
 */

export type PasswordCheck = {
    id: string;
    /** Texto curto na lista de requisitos */
    label: string;
    /** Mensagem retornada pela API quando falha */
    errorMessage: string;
    test: (password: string) => boolean;
};

const CHECKS: PasswordCheck[] = [
    {
        id: "len",
        label: "Pelo menos 12 caracteres",
        errorMessage: "A senha deve ter pelo menos 12 caracteres.",
        test: (p) => p.length >= 12,
    },
    {
        id: "lower",
        label: "Uma letra minúscula (a–z)",
        errorMessage: "Inclua pelo menos uma letra minúscula.",
        test: (p) => /[a-z]/.test(p),
    },
    {
        id: "upper",
        label: "Uma letra maiúscula (A–Z)",
        errorMessage: "Inclua pelo menos uma letra maiúscula.",
        test: (p) => /[A-Z]/.test(p),
    },
    {
        id: "digit",
        label: "Um número (0–9)",
        errorMessage: "Inclua pelo menos um número.",
        test: (p) => /[0-9]/.test(p),
    },
    {
        id: "special",
        label: "Um símbolo (!@#$%…)",
        errorMessage:
            "Inclua pelo menos um caractere especial (ex.: ! @ # $ % & *).",
        test: (p) =>
            /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(p),
    },
];

export function evaluatePasswordStrength(password: string): {
    score: 0 | 1 | 2 | 3 | 4;
    checks: Array<{ id: string; label: string; pass: boolean }>;
} {
    const results = CHECKS.map((c) => ({
        id: c.id,
        label: c.label,
        pass: c.test(password),
    }));
    const passed = results.filter((r) => r.pass).length;
    const score = (
        passed === 0 ? 0 : Math.min(4, Math.ceil((passed / CHECKS.length) * 4))
    ) as 0 | 1 | 2 | 3 | 4;
    return { score, checks: results };
}

/** Mensagens para retorno em `fieldErrors.password` (uma ou várias). */
export function passwordStrengthErrorMessages(password: string): string[] {
    return CHECKS.filter((c) => !c.test(password)).map((c) => c.errorMessage);
}

export const PASSWORD_MAX_LENGTH = 128;

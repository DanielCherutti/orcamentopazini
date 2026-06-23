/**
 * Verificação k-anonymity contra Have I Been Pwned (somente servidor).
 * @see https://haveibeenpwned.com/API/v3#PwnedPasswords
 */

import { createHash } from "node:crypto";
import {
    passwordStrengthErrorMessages,
    PASSWORD_MAX_LENGTH,
} from "@/lib/password-strength";
import { PRODUCT_USER_AGENT } from "@/lib/product-brand";

const HIBP_TIMEOUT_MS = 6000;

function sha1UpperHex(utf8: string): string {
    return createHash("sha1").update(utf8, "utf8").digest("hex").toUpperCase();
}

export async function isPasswordFoundInPwnedDatabase(
    password: string,
): Promise<boolean> {
    const hash = sha1UpperHex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HIBP_TIMEOUT_MS);

    try {
        const res = await fetch(
            `https://api.pwnedpasswords.com/range/${prefix}`,
            {
                method: "GET",
                signal: controller.signal,
                headers: {
                    "User-Agent": `${PRODUCT_USER_AGENT} (password-check)`,
                },
            },
        );
        clearTimeout(timer);

        if (!res.ok) {
            throw new Error(`hibp_http_${res.status}`);
        }

        const text = await res.text();
        const lines = text.split("\n");
        for (const line of lines) {
            const part = line.split(":")[0]?.trim();
            if (part && part.toUpperCase() === suffix) {
                return true;
            }
        }
        return false;
    } catch {
        clearTimeout(timer);
        throw new Error("hibp_unavailable");
    }
}

export type PasswordPolicyResult =
    | { ok: true }
    | { ok: false; errors: string[] };

/**
 * Força + (opcional) vazamento público. Usar apenas em Server Actions.
 */
export async function assertPasswordPolicy(
    password: string,
): Promise<PasswordPolicyResult> {
    if (typeof password !== "string") {
        return { ok: false, errors: ["Senha inválida."] };
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
        return { ok: false, errors: ["Senha muito longa."] };
    }

    const strengthErrors = passwordStrengthErrorMessages(password);
    if (strengthErrors.length > 0) {
        return { ok: false, errors: strengthErrors };
    }

    const skip =
        process.env.PAZINI_SKIP_PWNED_PASSWORD_CHECK === "true" ||
        process.env.PAZINI_SKIP_PWNED_PASSWORD_CHECK === "1";
    if (skip) {
        return { ok: true };
    }

    try {
        const pwned = await isPasswordFoundInPwnedDatabase(password);
        if (pwned) {
            return {
                ok: false,
                errors: [
                    "Esta senha aparece em bases públicas de vazamentos (Have I Been Pwned). Escolha outra, diferente das que você já usou em outros sites.",
                ],
            };
        }
    } catch {
        const relax =
            process.env.PAZINI_ALLOW_PASSWORD_IF_PWNED_CHECK_FAILS === "true" ||
            process.env.PAZINI_ALLOW_PASSWORD_IF_PWNED_CHECK_FAILS === "1";
        if (relax) {
            console.warn(
                "[password-policy] Verificação HIBP indisponível; aceitando senha (PAZINI_ALLOW_PASSWORD_IF_PWNED_CHECK_FAILS).",
            );
            return { ok: true };
        }
        return {
            ok: false,
            errors: [
                "Não foi possível verificar se esta senha já vazou. Verifique a internet e tente de novo, ou peça ao administrador para habilitar PAZINI_ALLOW_PASSWORD_IF_PWNED_CHECK_FAILS em ambiente restrito.",
            ],
        };
    }

    return { ok: true };
}

/**
 * Indica se o usuário já definiu senha (hash scrypt persistido após convite ou seed).
 */
export function passwordHashLooksValid(stored: unknown): boolean {
    return typeof stored === "string" && stored.startsWith("scrypt:v1:");
}

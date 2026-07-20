/** NCM (Nomenclatura Comum do Mercosul) é armazenado somente com seus 8 dígitos. */
export function normalizeNcm(value: unknown): string {
    return String(value ?? "").replace(/\D/g, "").slice(0, 8);
}

export function isValidNcm(value: string): boolean {
    return /^\d{8}$/.test(value);
}

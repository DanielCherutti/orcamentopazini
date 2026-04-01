/**
 * Interpreta texto digitado em pt-BR (vírgula decimal, ponto milhar) ou formato com ponto decimal.
 */
export function parseLocaleNumberInput(raw: string): number {
    const t = raw.trim().replace(/\s/g, "");
    if (!t) return Number.NaN;
    const hasComma = t.includes(",");
    const hasDot = t.includes(".");
    if (hasComma && hasDot) {
        const lastComma = t.lastIndexOf(",");
        const lastDot = t.lastIndexOf(".");
        if (lastComma > lastDot) {
            return Number.parseFloat(t.replace(/\./g, "").replace(",", "."));
        }
        return Number.parseFloat(t.replace(/,/g, ""));
    }
    if (hasComma) {
        return Number.parseFloat(t.replace(",", "."));
    }
    if (hasDot) {
        const parts = t.split(".");
        if (parts.length === 2) {
            return Number.parseFloat(t);
        }
        const last = parts.pop()!;
        return Number.parseFloat(parts.join("") + "." + last);
    }
    return Number.parseFloat(t);
}

/** Exibe quantidade para edição (pt-BR, sem separador de milhar). */
export function formatQuantityInputDisplay(n: number): string {
    if (!Number.isFinite(n)) return "";
    return n.toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 6,
        useGrouping: false,
    });
}

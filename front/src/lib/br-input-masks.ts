export function maskCnpj(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 14);
    return d
        .replace(/^(\d{2})(\d)/, "$1.$2")
        .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1/$2")
        .replace(/(\d{4})(\d)/, "$1-$2");
}

export function maskPhone(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 10) {
        return d.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").replace(/\($/, "");
    }
    return d.replace(/^(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}

export function maskCep(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 8);
    return d.replace(/^(\d{5})(\d{0,3})/, "$1-$2").replace(/-$/, "");
}

export function digitsOnly(v: string | undefined | null, maxLen?: number): string {
    const d = String(v ?? "").replace(/\D/g, "");
    return maxLen != null ? d.slice(0, maxLen) : d;
}

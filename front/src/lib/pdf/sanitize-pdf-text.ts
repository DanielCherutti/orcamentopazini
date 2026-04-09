/** Remove caracteres de controle e limita tamanho — evita bugs raros no textkit/PDFKit. */
export function sanitizeTextForPdf(input: unknown): string {
    let s = typeof input === "string" ? input : String(input ?? "");
    s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
    const max = 100_000;
    if (s.length > max) {
        s = `${s.slice(0, max)}\n…`;
    }
    return s;
}

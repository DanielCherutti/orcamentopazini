import { stripHtmlToText } from "@/lib/pdf/html-to-plain-text";
import { sanitizeTextForPdf } from "@/lib/pdf/sanitize-pdf-text";

export type CoverPdfBlock =
    | { type: "text"; content: string }
    | { type: "img"; src: string };

export type CoverPdfTextSegment =
    | { kind: "paragraph"; text: string; textAlign?: "left" | "center" | "right" }
    | { kind: "heading"; level: 1 | 2 | 3; text: string };

function parseTextAlignFromAttrs(attrs: string): "left" | "center" | "right" | undefined {
    const m = attrs.match(/text-align\s*:\s*(left|center|right)/i);
    if (!m) return undefined;
    return m[1].toLowerCase() as "left" | "center" | "right";
}

/**
 * Dentro de um bloco de texto da capa, extrai `<p>` e `<h1>`–`<h3>` na ordem (alinhamento em `<p>`).
 */
export function splitCoverHtmlFragmentToSegments(html: string): CoverPdfTextSegment[] {
    const segments: CoverPdfTextSegment[] = [];
    const re = /<(p|h1|h2|h3)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const tag = m[1].toLowerCase();
        const attrs = m[2];
        const inner = m[3];
        const text = sanitizeTextForPdf(stripHtmlToText(inner));
        if (!text.trim()) continue;
        if (tag === "p") {
            segments.push({ kind: "paragraph", text, textAlign: parseTextAlignFromAttrs(attrs) });
        } else {
            const level = (tag === "h1" ? 1 : tag === "h2" ? 2 : 3) as 1 | 2 | 3;
            segments.push({ kind: "heading", level, text });
        }
    }
    if (segments.length === 0) {
        const t = sanitizeTextForPdf(stripHtmlToText(html));
        if (t.trim()) segments.push({ kind: "paragraph", text: t });
    }
    return segments;
}

/**
 * Separa trechos de texto e `<img>` em ordem, para renderizar só com componentes nativos
 * do @react-pdf/renderer (evita react-pdf-html / Yoga com valores inválidos).
 */
export function splitCoverHtmlIntoPdfBlocks(html: string): CoverPdfBlock[] {
    if (!html.trim()) return [{ type: "text", content: "" }];
    const imgRe = /<img\b[^>]*>/gi;
    const blocks: CoverPdfBlock[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = imgRe.exec(html)) !== null) {
        if (m.index > last) {
            blocks.push({ type: "text", content: html.slice(last, m.index) });
        }
        const tag = m[0];
        const quoted =
            tag.match(/\bsrc\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bsrc\s*=\s*'([^']*)'/i)?.[1];
        const unquoted = quoted ?? tag.match(/\bsrc\s*=\s*([^\s>]+)/i)?.[1];
        const src = unquoted?.trim();
        if (src) {
            blocks.push({ type: "img", src });
        }
        last = m.index + tag.length;
    }
    if (last < html.length) {
        blocks.push({ type: "text", content: html.slice(last) });
    }
    if (blocks.length === 0) {
        blocks.push({ type: "text", content: html });
    }
    return blocks;
}

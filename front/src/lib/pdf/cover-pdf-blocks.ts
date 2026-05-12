import { stripHtmlToText } from "@/lib/pdf/html-to-plain-text";
import { sanitizeTextForPdf } from "@/lib/pdf/sanitize-pdf-text";

export type CoverPdfBlock =
    | { type: "text"; content: string }
    | { type: "img"; src: string; widthPt?: number; heightPt?: number };

export type CoverPdfTextSegment =
    | { kind: "paragraph"; text: string; textAlign?: "left" | "center" | "right"; isEmpty?: boolean }
    | { kind: "heading"; level: 1 | 2 | 3; text: string; textAlign?: "left" | "center" | "right" };

function parseTextAlignFromAttrs(attrs: string): "left" | "center" | "right" | undefined {
    const m =
        attrs.match(/text-align\s*:\s*(left|center|right)/i) ??
        attrs.match(/\balign\s*=\s*["']?(left|center|right)/i);
    if (!m) return undefined;
    return m[1].toLowerCase() as "left" | "center" | "right";
}

function parseCssLengthToPt(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    const v = raw.trim().toLowerCase();
    if (!v) return undefined;
    const m = v.match(/^(-?\d*\.?\d+)\s*(px|pt)?$/i);
    if (!m) return undefined;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    const unit = (m[2] || "px").toLowerCase();
    if (unit === "pt") return n;
    return n * 0.75; // 1px ~ 0.75pt
}

function parseImgDimensionPt(tag: string, prop: "width" | "height"): number | undefined {
    const styleQ =
        tag.match(new RegExp(String.raw`style\s*=\s*"([^"]*)"`, "i"))?.[1] ??
        tag.match(new RegExp(String.raw`style\s*=\s*'([^']*)'`, "i"))?.[1];
    if (styleQ) {
        const sm = styleQ.match(new RegExp(String.raw`\b${prop}\s*:\s*([^;]+)`, "i"));
        const fromStyle = parseCssLengthToPt(sm?.[1]);
        if (fromStyle) return fromStyle;
    }
    const attrQ =
        tag.match(new RegExp(String.raw`\b${prop}\s*=\s*"([^"]+)"`, "i"))?.[1] ??
        tag.match(new RegExp(String.raw`\b${prop}\s*=\s*'([^']+)'`, "i"))?.[1] ??
        tag.match(new RegExp(String.raw`\b${prop}\s*=\s*([^\s>]+)`, "i"))?.[1];
    return parseCssLengthToPt(attrQ);
}

/**
 * Dentro de um bloco de texto da capa, extrai `<p>`/`<div>` e `<h1>`–`<h3>` na ordem.
 */
export function splitCoverHtmlFragmentToSegments(
    html: string,
    options?: { preserveEmptyParagraphs?: boolean }
): CoverPdfTextSegment[] {
    const segments: CoverPdfTextSegment[] = [];
    const re = /<(p|div|h1|h2|h3)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const tag = m[1].toLowerCase();
        const attrs = m[2];
        const inner = m[3];
        const preserveEmpty = options?.preserveEmptyParagraphs === true;
        const text = sanitizeTextForPdf(stripHtmlToText(inner));
        if (tag === "p" || tag === "div") {
            if (!text.trim()) {
                if (preserveEmpty) {
                    segments.push({
                        kind: "paragraph",
                        text: "",
                        textAlign: parseTextAlignFromAttrs(attrs),
                        isEmpty: true,
                    });
                }
                continue;
            }
            segments.push({ kind: "paragraph", text, textAlign: parseTextAlignFromAttrs(attrs), isEmpty: false });
        } else {
            if (!text.trim()) continue;
            const level = (tag === "h1" ? 1 : tag === "h2" ? 2 : 3) as 1 | 2 | 3;
            segments.push({ kind: "heading", level, text, textAlign: parseTextAlignFromAttrs(attrs) });
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
            blocks.push({
                type: "img",
                src,
                widthPt: parseImgDimensionPt(tag, "width"),
                heightPt: parseImgDimensionPt(tag, "height"),
            });
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

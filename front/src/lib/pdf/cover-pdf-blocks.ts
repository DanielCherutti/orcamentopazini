import { stripHtmlToText } from "@/lib/pdf/html-to-plain-text";
import { sanitizeTextForPdf } from "@/lib/pdf/sanitize-pdf-text";

export type CoverPdfBlock =
    | { type: "text"; content: string }
    | { type: "pageBreak" }
    | {
          type: "img";
          src: string;
          widthPt?: number;
          heightPt?: number;
          naturalWidth?: number;
          naturalHeight?: number;
          align?: "left" | "center" | "right";
      };

export type CoverPdfTextSegment =
    | {
          kind: "paragraph";
          /** Texto plano (fallback). */
          text: string;
          /** HTML interno do bloco (para renderização rica no PDF). */
          rawHtml?: string;
          textAlign?: "left" | "center" | "right" | "justify";
          isEmpty?: boolean;
      }
    | {
          kind: "heading";
          level: 1 | 2 | 3;
          /** Texto plano (fallback). */
          text: string;
          /** HTML interno do bloco (para renderização rica no PDF). */
          rawHtml?: string;
          textAlign?: "left" | "center" | "right" | "justify";
      };

function parseTextAlignFromAttrs(attrs: string): "left" | "center" | "right" | "justify" | undefined {
    const m =
        attrs.match(/text-align\s*:\s*(left|center|right|justify)/i) ??
        attrs.match(/\balign\s*=\s*["']?(left|center|right|justify)/i);
    if (!m) return undefined;
    return m[1].toLowerCase() as "left" | "center" | "right" | "justify";
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

function parseNumericAttribute(tag: string, attr: string): number | undefined {
    const raw =
        tag.match(new RegExp(String.raw`\b${attr}\s*=\s*"([^"]+)"`, "i"))?.[1] ??
        tag.match(new RegExp(String.raw`\b${attr}\s*=\s*'([^']+)'`, "i"))?.[1] ??
        tag.match(new RegExp(String.raw`\b${attr}\s*=\s*([^\s>]+)`, "i"))?.[1];
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseImageAlignFromContext(html: string, imgStart: number, imgEnd: number, tag: string) {
    const dataAlign =
        tag.match(/\bdata-image-align\s*=\s*"([^"]+)"/i)?.[1] ??
        tag.match(/\bdata-image-align\s*=\s*'([^']+)'/i)?.[1] ??
        tag.match(/\bdata-image-align\s*=\s*([^\s>]+)/i)?.[1];
    if (dataAlign === "left" || dataAlign === "center" || dataAlign === "right") return dataAlign;

    const imgAlign = parseTextAlignFromAttrs(tag);
    if (imgAlign === "left" || imgAlign === "center" || imgAlign === "right") return imgAlign;

    const before = html.slice(0, imgStart);
    const after = html.slice(imgEnd);
    const openBlock = before.match(/<(p|div|figure)\b([^>]*)>[^<]*$/i);
    if (openBlock && new RegExp(String.raw`^\s*</${openBlock[1]}\s*>`, "i").test(after)) {
        const blockAlign = parseTextAlignFromAttrs(openBlock[2]);
        if (blockAlign === "left" || blockAlign === "center" || blockAlign === "right") return blockAlign;
    }

    const style =
        tag.match(/style\s*=\s*"([^"]*)"/i)?.[1] ??
        tag.match(/style\s*=\s*'([^']*)'/i)?.[1] ??
        "";
    const normalized = style.toLowerCase();
    if (/margin-left\s*:\s*auto/.test(normalized) && /margin-right\s*:\s*auto/.test(normalized)) return "center";
    if (/float\s*:\s*right/.test(normalized) || /margin-left\s*:\s*auto/.test(normalized)) return "right";
    if (/float\s*:\s*left/.test(normalized) || /margin-right\s*:\s*auto/.test(normalized)) return "left";
    return undefined;
}

function stripEmptyImageWrapperFromTextBlock(content: string): string {
    return content.replace(/<(p|div|figure)\b[^>]*>\s*$/i, "").replace(/^\s*<\/(p|div|figure)\s*>/i, "");
}

const PAGE_BREAK_ATTR_OR_CLASS_RE = /(?:\bdata-page-break\s*=\s*(?:"true"|'true'|true)|\bclass\s*=\s*(?:"[^"]*\beditor-page-break\b[^"]*"|'[^']*\beditor-page-break\b[^']*'|[^\s>]*\beditor-page-break\b[^\s>]*))/i;
const PAGE_BREAK_STYLE_RE = /\b(?:break-(?:before|after)|page-break-(?:before|after))\s*:\s*(?:page|always)\b/i;

function tagHasPageBreakMarker(tag: string): boolean {
    return PAGE_BREAK_ATTR_OR_CLASS_RE.test(tag) || PAGE_BREAK_STYLE_RE.test(tag);
}

export function htmlContainsPageBreak(raw: unknown): boolean {
    const html = String(raw ?? "");
    if (!html.trim()) return false;
    return /<(?:div|hr)\b[^>]*(?:data-page-break|editor-page-break|break-before|break-after|page-break-before|page-break-after)[^>]*>/i.test(html)
        ? html.split(/(?=<(?:div|hr)\b)/i).some((fragment) => tagHasPageBreakMarker(fragment.match(/^<[^>]+>/)?.[0] ?? ""))
        : false;
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
                        rawHtml: inner,
                        textAlign: parseTextAlignFromAttrs(attrs),
                        isEmpty: true,
                    });
                }
                continue;
            }
            segments.push({
                kind: "paragraph",
                text,
                rawHtml: inner,
                textAlign: parseTextAlignFromAttrs(attrs),
                isEmpty: false,
            });
        } else {
            if (!text.trim()) continue;
            const level = (tag === "h1" ? 1 : tag === "h2" ? 2 : 3) as 1 | 2 | 3;
            segments.push({ kind: "heading", level, text, rawHtml: inner, textAlign: parseTextAlignFromAttrs(attrs) });
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
    const pageBreakAttrOrClass = String.raw`(?:\bdata-page-break\s*=\s*(?:"true"|'true'|true)|\bclass\s*=\s*(?:"[^"]*\beditor-page-break\b[^"]*"|'[^']*\beditor-page-break\b[^']*'|[^\s>]*\beditor-page-break\b[^\s>]*))`;
    const pageBreakStyle = String.raw`\b(?:break-(?:before|after)|page-break-(?:before|after))\s*:\s*(?:page|always)\b`;
    const blockRe = new RegExp(
        String.raw`<img\b[^>]*>|<div\b(?=[^>]*(?:${pageBreakAttrOrClass}|${pageBreakStyle}))[^>]*>[\s\S]*?<\/div>|<hr\b(?=[^>]*(?:${pageBreakAttrOrClass}|${pageBreakStyle}))[^>]*\/?>`,
        "gi"
    );
    const blocks: CoverPdfBlock[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(html)) !== null) {
        if (m.index > last) {
            blocks.push({ type: "text", content: html.slice(last, m.index) });
        }
        const tag = m[0];
        if (tagHasPageBreakMarker(tag)) {
            blocks.push({ type: "pageBreak" });
            last = m.index + tag.length;
            continue;
        }
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
                naturalWidth: parseNumericAttribute(tag, "data-natural-width"),
                naturalHeight: parseNumericAttribute(tag, "data-natural-height"),
                align: parseImageAlignFromContext(html, m.index, m.index + tag.length, tag),
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
    return blocks
        .map((block) =>
            block.type === "text"
                ? { ...block, content: stripEmptyImageWrapperFromTextBlock(block.content) }
                : block
        )
        .filter((block) => block.type === "img" || block.type === "pageBreak" || stripHtmlToText(block.content).trim() || /<(p|div|h1|h2|h3)\b/i.test(block.content));
}

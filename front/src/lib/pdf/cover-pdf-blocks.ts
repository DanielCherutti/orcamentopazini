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
          lineHeight?: number;
          marginTopPt?: number;
          marginBottomPt?: number;
          marginLeftPt?: number;
          marginRightPt?: number;
          textIndentPt?: number;
          listMarker?: string;
          listDepth?: number;
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
          lineHeight?: number;
          marginTopPt?: number;
          marginBottomPt?: number;
          marginLeftPt?: number;
          marginRightPt?: number;
          textIndentPt?: number;
          listMarker?: string;
          listDepth?: number;
      };

function parseTextAlignFromAttrs(attrs: string): "left" | "center" | "right" | "justify" | undefined {
    const m =
        attrs.match(/text-align\s*:\s*(left|center|right|justify)/i) ??
        attrs.match(/\balign\s*=\s*["']?(left|center|right|justify)/i);
    if (!m) return undefined;
    return m[1].toLowerCase() as "left" | "center" | "right" | "justify";
}

function parseParagraphLayoutFromAttrs(attrs: string) {
    const lineHeightRaw = attrs.match(/line-height\s*:\s*(\d*\.?\d+)/i)?.[1];
    const lineHeight = Number(lineHeightRaw);
    const marginTopRaw = attrs.match(/margin-top\s*:\s*([^;"']+)/i)?.[1];
    const marginBottomRaw = attrs.match(/margin-bottom\s*:\s*([^;"']+)/i)?.[1];
    const marginLeftRaw = attrs.match(/margin-left\s*:\s*([^;"']+)/i)?.[1];
    const marginRightRaw = attrs.match(/margin-right\s*:\s*([^;"']+)/i)?.[1];
    const textIndentRaw = attrs.match(/text-indent\s*:\s*([^;"']+)/i)?.[1];
    return {
        lineHeight: Number.isFinite(lineHeight) && lineHeight >= 0.8 && lineHeight <= 4 ? lineHeight : undefined,
        marginTopPt: parseCssLengthToPt(marginTopRaw),
        marginBottomPt: parseCssLengthToPt(marginBottomRaw),
        marginLeftPt: parseCssLengthToPt(marginLeftRaw),
        marginRightPt: parseCssLengthToPt(marginRightRaw),
        textIndentPt: parseCssLengthToPt(textIndentRaw, true),
    };
}

function parseCssLengthToPt(raw: string | undefined, allowNegative = false): number | undefined {
    if (!raw) return undefined;
    const v = raw.trim().toLowerCase();
    if (!v) return undefined;
    const m = v.match(/^(-?\d*\.?\d+)\s*(px|pt|cm|mm|in)?$/i);
    if (!m) return undefined;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || (allowNegative ? n === 0 : n <= 0)) return undefined;
    const unit = (m[2] || "px").toLowerCase();
    if (unit === "pt") return n;
    if (unit === "cm") return n * (72 / 2.54);
    if (unit === "mm") return n * (72 / 25.4);
    if (unit === "in") return n * 72;
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
    const listStack: Array<{
        kind: "ul" | "ol";
        counter: number;
        pendingMarker?: string;
    }> = [];
    let cursor = 0;
    const scanListTags = (fragment: string) => {
        const tagRe = /<\s*(\/?)\s*(ul|ol|li)\b([^>]*)>/gi;
        let tagMatch: RegExpExecArray | null;
        while ((tagMatch = tagRe.exec(fragment)) !== null) {
            const closing = tagMatch[1] === "/";
            const name = tagMatch[2].toLowerCase() as "ul" | "ol" | "li";
            const attrs = tagMatch[3] ?? "";
            if (name === "ul" || name === "ol") {
                if (closing) {
                    listStack.pop();
                } else {
                    const start = name === "ol" ? Number(attrs.match(/\bstart\s*=\s*["']?(\d+)/i)?.[1] ?? 1) : 1;
                    listStack.push({ kind: name, counter: Math.max(0, start - 1) });
                }
                continue;
            }
            const active = listStack[listStack.length - 1];
            if (!active) continue;
            if (closing) {
                active.pendingMarker = undefined;
                continue;
            }
            const explicitValue = Number(attrs.match(/\bvalue\s*=\s*["']?(\d+)/i)?.[1]);
            if (active.kind === "ol") {
                active.counter = Number.isFinite(explicitValue) && explicitValue > 0
                    ? explicitValue
                    : active.counter + 1;
                active.pendingMarker = `${active.counter}.`;
            } else {
                const bullets = ["•", "◦", "▪"];
                active.pendingMarker = bullets[(listStack.length - 1) % bullets.length];
            }
        }
    };
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        scanListTags(html.slice(cursor, m.index));
        cursor = re.lastIndex;
        const tag = m[1].toLowerCase();
        const attrs = m[2];
        const paragraphLayout = parseParagraphLayoutFromAttrs(attrs);
        const inner = m[3];
        const preserveEmpty = options?.preserveEmptyParagraphs === true;
        const text = sanitizeTextForPdf(stripHtmlToText(inner));
        const activeList = listStack[listStack.length - 1];
        const listMarker = activeList?.pendingMarker;
        const listLayout = listMarker
            ? { listMarker, listDepth: Math.max(1, listStack.length) }
            : {};
        if (listMarker && activeList) activeList.pendingMarker = undefined;
        if (tag === "p" || tag === "div") {
            if (!text.trim()) {
                if (preserveEmpty) {
                    segments.push({
                        kind: "paragraph",
                        text: "",
                        rawHtml: inner,
                        textAlign: parseTextAlignFromAttrs(attrs),
                        ...paragraphLayout,
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
                ...listLayout,
                ...paragraphLayout,
                isEmpty: false,
            });
        } else {
            if (!text.trim()) continue;
            const level = (tag === "h1" ? 1 : tag === "h2" ? 2 : 3) as 1 | 2 | 3;
            segments.push({
                kind: "heading",
                level,
                text,
                rawHtml: inner,
                textAlign: parseTextAlignFromAttrs(attrs),
                ...paragraphLayout,
            });
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

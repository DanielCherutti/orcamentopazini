/**
 * Evita valores numéricos absurdos no CSS que quebram o Yoga (@react-pdf):
 * "unsupported number: -1.8054132924569344e+21"
 *
 * - `sanitizeRichHtmlForStorage`: ao salvar (compositor), remove `<style>` e CSS perigoso,
 *   mantendo estilos inline seguros no TipTap.
 * - `sanitizeCoverHtmlForPdf`: na capa do PDF, remove CSS perigoso / SVG / embed; mantém estilos
 *   inline seguros para o parser da capa (`<p>` com text-align, etc.).
 */

/** Decodifica entidades mínimas para o regex apanhar atributos guardados como &quot;…&quot; */
function decodeCommonEntitiesForAttributeScan(html: string): string {
    return html
        .replace(/&quot;/g, '"')
        .replace(/&#0*34;/g, '"')
        .replace(/&#x0*22;/gi, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&#0*39;/g, "'");
}

function removeEmbeddedStyleTags(html: string): string {
    return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
}

/** width/height numéricos absurdos em atributos HTML */
function stripExtremeWidthHeightAttributes(html: string): string {
    const strip = (full: string, val: string) => {
        const n = parseFloat(val.replace(/px|pt|em|rem$/i, ""));
        if (!Number.isFinite(n) || Math.abs(n) > 8000) return "";
        return full;
    };
    let out = html.replace(/\s(width|height)\s*=\s*"([^"]*)"/gi, (full, _a, val) => strip(full, val));
    out = out.replace(/\s(width|height)\s*=\s*'([^']*)'/gi, (full, _a, val) => strip(full, val));
    out = out.replace(/\s(width|height)\s*=\s*([^\s"'=<>`]+)/gi, (full, _a, val) => strip(full, val));
    return out;
}

function clampColspanAttributes(html: string): string {
    const clampVal = (n: number) => (Number.isFinite(n) && n >= 1 && n <= 24 ? n : 1);
    let out = html.replace(/\scolspan\s*=\s*"(\d+)"/gi, (_full, d: string) => ` colspan="${clampVal(parseInt(d, 10))}"`);
    out = out.replace(/\scolspan\s*=\s*'(\d+)'/gi, (_full, d: string) => ` colspan='${clampVal(parseInt(d, 10))}'`);
    out = out.replace(/\scolspan\s*=\s*(\d+)(?=\s|\/>|>)/gi, (_full, d: string) => ` colspan="${clampVal(parseInt(d, 10))}"`);
    return out;
}

/** `react-pdf-html` repassa atributos SVG ao Yoga; valores enormes quebram o layout. */
function stripSvgBlocksFromHtml(html: string): string {
    let out = html;
    let prev = "";
    while (out !== prev) {
        prev = out;
        out = out.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "");
    }
    return out;
}

function stripEmbeddedExternalTags(html: string): string {
    return html
        .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
        .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, "")
        .replace(/<embed\b[^>]*>/gi, "");
}

/** Troca sequências numéricas perigosas em CSS (trechos que ainda sobrevivam). */
export function scrubExtremeNumbersInCssFragment(css: string): string {
    let s = css.replace(/\u2212/g, "-");
    s = s.replace(/[+-]?(?:\d+\.?\d*|\.\d+)[eE][+-]?\d+/g, (m) => {
        const n = parseFloat(m);
        return Number.isFinite(n) && Math.abs(n) > 8000 ? "0" : m;
    });
    s = s.replace(/\d{12,}/g, "0");
    return s;
}

function declarationIsUnsafeForPdf(decl: string): boolean {
    const colon = decl.indexOf(":");
    if (colon === -1) return false;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    const val = decl.slice(colon + 1).trim();
    if (!val) return false;
    // react-pdf-html repassa ao Yoga; matrix/calc costuma gerar overflow (-1.8e+21).
    if (
        prop === "transform" ||
        prop === "filter" ||
        prop === "backdrop-filter" ||
        prop === "perspective" ||
        prop === "will-change"
    ) {
        return true;
    }
    if (/[0-9][eE][+-]?\d+/i.test(val)) return true;
    const dim = /(-?\d*\.?\d+)\s*(px|pt|em|rem|ch|cm|mm|in)\b/gi;
    let m: RegExpExecArray | null;
    while ((m = dim.exec(val)) !== null) {
        const n = parseFloat(m[1]);
        if (Number.isFinite(n) && Math.abs(n) > 8000) return true;
    }
    const pct = /(-?\d*\.?\d+)\s*%/gi;
    while ((m = pct.exec(val)) !== null) {
        const n = parseFloat(m[1]);
        if (Number.isFinite(n) && (n < -500 || n > 500)) return true;
    }
    return false;
}

function decodeStyleFragmentEntities(fragment: string): string {
    return fragment
        .replace(/&quot;/g, '"')
        .replace(/&#0*34;/g, '"')
        .replace(/&#x0*22;/gi, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&#0*39;/g, "'")
        .replace(/&amp;/g, "&");
}

function sanitizeStyleAttributeMatches(html: string, quote: '"' | "'"): string {
    const pattern =
        quote === '"'
            ? /\bstyle\s*=\s*"([^"]*)"/gi
            : /\bstyle\s*=\s*'([^']*)'/gi;
    return html.replace(pattern, (full, styleContent: string) => {
        const decoded = decodeStyleFragmentEntities(styleContent);
        const scrubbed = scrubExtremeNumbersInCssFragment(decoded);
        const decls = scrubbed
            .split(";")
            .map((s) => s.trim())
            .filter(Boolean)
            .filter((d) => !declarationIsUnsafeForPdf(d));
        if (!decls.length) return "";
        return ` style=${quote}${decls.join("; ")}${quote}`;
    });
}

export function sanitizeInlineStylesInHtmlForPdf(html: string): string {
    if (!/\bstyle\s*=/i.test(html)) return html;
    let out = sanitizeStyleAttributeMatches(html, '"');
    out = sanitizeStyleAttributeMatches(out, "'");
    return out;
}

/**
 * Sanitiza HTML rico do compositor ao salvar / antes do PDF.
 * Remove `<style>` embutido, declarações CSS perigosas e dimensões absurdas,
 * preservando estilos inline seguros (ex.: text-align, color) para o TipTap.
 */
export function sanitizeRichHtmlForStorage(html: string): string {
    let out = removeEmbeddedStyleTags(html);
    out = sanitizeInlineStylesInHtmlForPdf(out);
    out = stripExtremeWidthHeightAttributes(out);
    out = clampColspanAttributes(out);
    return out;
}

/**
 * Capa no PDF: remove CSS perigoso e SVG/embed, mas mantém estilos inline seguros
 * (ex.: text-align, tamanho de fonte) para o renderizador nativo interpretar `<p>` / `<h1>`…
 */
export function sanitizeCoverHtmlForPdf(html: string): string {
    let out = decodeCommonEntitiesForAttributeScan(html);
    out = sanitizeRichHtmlForStorage(out);
    out = stripExtremeWidthHeightAttributes(out);
    out = clampColspanAttributes(out);
    out = stripSvgBlocksFromHtml(out);
    out = stripEmbeddedExternalTags(out);
    return out;
}

/** Campos HTML por tipo de bloco do compositor — alinhado a `budget-compositor-types`. */
const COMPOSITOR_BLOCK_HTML_FIELDS: Record<string, readonly string[]> = {
    cover: ["cover_document_html"],
    header_footer: [
        "cover_header_html",
        "cover_footer_html",
        "inner_header_html",
        "inner_footer_html",
    ],
    session: ["description"],
    text: ["content"],
    terms: ["description"],
    location: ["description"],
    section: ["description"],
};

/** Sanitiza strings HTML nas props antes de persistir (reforço server-side). */
export function sanitizeCompositorBlockPropsForPersistence(
    type: string,
    props: Record<string, unknown>
): Record<string, unknown> {
    const keys = COMPOSITOR_BLOCK_HTML_FIELDS[type];
    if (!keys?.length) return props;
    const next = { ...props };
    for (const key of keys) {
        const v = next[key];
        if (typeof v === "string") {
            next[key] = sanitizeRichHtmlForStorage(v);
        }
    }
    return next;
}

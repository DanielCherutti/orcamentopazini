/**
 * Evita valores numéricos absurdos no CSS que quebram o Yoga (@react-pdf):
 * "unsupported number: -1.8054132924569344e+21"
 *
 * Estratégia: além de scrub em CSS, removemos `<style>` embutidos (TipTap/prose)
 * e todos os `style="..."` da capa no PDF — o `coverHtmlStylesheet` continua a
 * estilizar tags (p, h1, strong, …).
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

/** Remove todos os atributos style (inclui valores multilinha). */
function stripAllInlineStyleAttributes(html: string): string {
    let out = html;
    let prev = "";
    while (out !== prev) {
        prev = out;
        out = out.replace(/\sstyle\s*=\s*"[\s\S]*?"/gi, "");
        out = out.replace(/\sstyle\s*=\s*'[\s\S]*?'/gi, "");
    }
    return out;
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
    const val = decl.slice(colon + 1).trim();
    if (!val) return false;
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

/** Capa no PDF: máxima proteção contra Yoga (remove estilos inline + blocos style). */
export function sanitizeCoverHtmlForPdf(html: string): string {
    let out = decodeCommonEntitiesForAttributeScan(html);
    out = removeEmbeddedStyleTags(out);
    out = stripAllInlineStyleAttributes(out);
    out = stripExtremeWidthHeightAttributes(out);
    out = clampColspanAttributes(out);
    return out;
}

import type { Style } from "@react-pdf/types";
import { theme } from "@/components/pdf/theme";
import { sanitizeTextForPdf } from "@/lib/pdf/sanitize-pdf-text";

export type PdfInlineRun = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fontSizePt?: number;
  fontFamily?: string;
  fontUrl?: string;
};

type ActiveMark = {
  tag: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fontSizePt?: number;
  fontFamily?: string;
  fontUrl?: string;
};

function decodeNumericEntity(raw: string, radix: number): string {
  const codePoint = Number.parseInt(raw, radix);
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return "";
  return String.fromCodePoint(codePoint);
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, decimal: string) => decodeNumericEntity(decimal, 10))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => decodeNumericEntity(hex, 16));
}

function markFromOpeningTag(tagName: string, tag: string): ActiveMark | null {
  const style =
    tag.match(/\bstyle\s*=\s*"([^"]*)"/i)?.[1] ??
    tag.match(/\bstyle\s*=\s*'([^']*)'/i)?.[1] ??
    "";
  const bold =
    tagName === "strong" ||
    tagName === "b" ||
    /\bfont-weight\s*:\s*(?:bold|[6-9]00)\b/i.test(style);
  const italic =
    tagName === "em" ||
    tagName === "i" ||
    /\bfont-style\s*:\s*italic\b/i.test(style);
  const underline =
    tagName === "u" ||
    tagName === "a" ||
    /\btext-decoration(?:-line)?\s*:[^;]*\bunderline\b/i.test(style);
  const fontSizeMatch = style.match(/\bfont-size\s*:\s*(\d*\.?\d+)\s*(px|pt)\b/i);
  const fontSizeRaw = Number(fontSizeMatch?.[1]);
  const fontSizePt = Number.isFinite(fontSizeRaw) && fontSizeRaw > 0
    ? Math.max(6, Math.min(72, fontSizeRaw * (fontSizeMatch?.[2]?.toLowerCase() === "px" ? 0.75 : 1)))
    : undefined;
  const fontFamily = style
    .match(/\bfont-family\s*:\s*(?:"([^"]+)"|'([^']+)'|([^;]+))/i)
    ?.slice(1)
    .find(Boolean)
    ?.trim();
  const fontUrl =
    tag.match(/\bdata-font-url\s*=\s*"([^"]+)"/i)?.[1] ??
    tag.match(/\bdata-font-url\s*=\s*'([^']+)'/i)?.[1];
  if (!bold && !italic && !underline && !fontSizePt && !fontFamily && !fontUrl) return null;
  return { tag: tagName, bold, italic, underline, fontSizePt, fontFamily, fontUrl };
}

export function parsePdfInlineRuns(html: string): PdfInlineRun[] {
  const runs: PdfInlineRun[] = [];
  const activeMarks: ActiveMark[] = [];
  const tagPattern = /<[^>]+>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushText = (raw: string) => {
    const text = sanitizeTextForPdf(decodeHtmlEntities(raw).replace(/\s+/g, " "));
    if (!text) return;
    runs.push({
      text,
      bold: activeMarks.some((mark) => mark.bold),
      italic: activeMarks.some((mark) => mark.italic),
      underline: activeMarks.some((mark) => mark.underline),
      fontSizePt: activeMarks.findLast((mark) => mark.fontSizePt !== undefined)?.fontSizePt,
      fontFamily: activeMarks.findLast((mark) => mark.fontFamily !== undefined)?.fontFamily,
      fontUrl: activeMarks.findLast((mark) => mark.fontUrl !== undefined)?.fontUrl,
    });
  };
  const pushBreak = () => {
    runs.push({
      text: "\n",
      bold: activeMarks.some((mark) => mark.bold),
      italic: activeMarks.some((mark) => mark.italic),
      underline: activeMarks.some((mark) => mark.underline),
      fontSizePt: activeMarks.findLast((mark) => mark.fontSizePt !== undefined)?.fontSizePt,
      fontFamily: activeMarks.findLast((mark) => mark.fontFamily !== undefined)?.fontFamily,
      fontUrl: activeMarks.findLast((mark) => mark.fontUrl !== undefined)?.fontUrl,
    });
  };

  while ((match = tagPattern.exec(html)) !== null) {
    if (match.index > lastIndex) pushText(html.slice(lastIndex, match.index));
    const tag = match[0];
    const closing = /^<\s*\//.test(tag);
    const tagName = tag.match(/^<\s*\/?\s*([a-z0-9]+)/i)?.[1]?.toLowerCase() ?? "";

    if (!closing && tagName === "br") {
      pushBreak();
    } else if (closing) {
      const index = activeMarks.map((mark) => mark.tag).lastIndexOf(tagName);
      if (index >= 0) activeMarks.splice(index, 1);
    } else {
      const mark = markFromOpeningTag(tagName, tag);
      if (mark) activeMarks.push(mark);
    }
    lastIndex = match.index + tag.length;
  }

  if (lastIndex < html.length) pushText(html.slice(lastIndex));
  return runs;
}

export function pdfInlineRunStyle(run: PdfInlineRun): Style {
  const selectedFamily = pdfFontFamily(run.fontFamily, run.bold, run.italic);
  const fontFamily = selectedFamily ?? (
    run.bold && run.italic
      ? theme.fonts.boldOblique
      : run.bold
        ? theme.fonts.bold
        : run.italic
          ? theme.fonts.oblique
          : undefined
  );
  return {
    ...(fontFamily ? { fontFamily } : {}),
    ...(selectedFamily && run.fontUrl && run.bold ? { fontWeight: 700 } : {}),
    ...(selectedFamily && run.fontUrl && run.italic ? { fontStyle: "italic" } : {}),
    ...(run.underline ? { textDecoration: "underline" } : {}),
    ...(run.fontSizePt ? { fontSize: run.fontSizePt } : {}),
  };
}

function pdfFontFamily(value: string | undefined, bold: boolean, italic: boolean): string | undefined {
  const family = value?.trim().replace(/^["']|["']$/g, "");
  if (!family) return undefined;
  if (family === "Arial" || family === "Verdana" || family === "Helvetica") {
    if (bold && italic) return "Helvetica-BoldOblique";
    if (bold) return "Helvetica-Bold";
    if (italic) return "Helvetica-Oblique";
    return "Helvetica";
  }
  if (family === "Times New Roman" || family === "Georgia") {
    if (bold && italic) return "Times-BoldItalic";
    if (bold) return "Times-Bold";
    if (italic) return "Times-Italic";
    return "Times-Roman";
  }
  if (family === "Courier New") {
    if (bold && italic) return "Courier-BoldOblique";
    if (bold) return "Courier-Bold";
    if (italic) return "Courier-Oblique";
    return "Courier";
  }
  return family;
}

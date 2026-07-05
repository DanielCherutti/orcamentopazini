import fs from "node:fs/promises";
import path from "node:path";
import { Font } from "@react-pdf/renderer";
import type { CompositorPdfPayload } from "@/components/pdf/compositor-pdf-types";
import { getUploadsRoot } from "@/lib/upload";

type FontReference = { family: string; url: string };

function collectFontReferences(value: unknown, output: Map<string, FontReference>): void {
  if (typeof value === "string") {
    const tagPattern = /<[^>]*\bdata-font-url\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = tagPattern.exec(value)) !== null) {
      const tag = match[0];
      const url = (match[1] || match[2] || "").trim();
      const family =
        tag.match(/\bfont-family\s*:\s*(?:"([^"]+)"|'([^']+)'|([^;"]+))/i)
          ?.slice(1)
          .find(Boolean)
          ?.trim() ?? "";
      if (family && url) output.set(`${family}\0${url}`, { family, url });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectFontReferences(item, output));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const family = typeof record.font_family === "string" ? record.font_family.trim() : "";
  const url = typeof record.font_url === "string" ? record.font_url.trim() : "";
  if (family && url) output.set(`${family}\0${url}`, { family, url });
  Object.values(record).forEach((item) => collectFontReferences(item, output));
}

async function loadUploadedFont(url: string): Promise<{ dataUri: string; format: string } | null> {
  let pathname = url;
  try {
    if (/^https?:\/\//i.test(url)) pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const match = pathname.match(/^\/api\/uploads\/(.+)$/i);
  if (!match) return null;
  const segments = match[1].split("/").filter(Boolean);
  if (segments.some((segment) => segment === ".." || segment.includes("\0"))) return null;
  const root = path.resolve(getUploadsRoot());
  const fullPath = path.resolve(root, ...segments);
  if (!fullPath.startsWith(root + path.sep)) return null;
  try {
    const buffer = await fs.readFile(fullPath);
    const extension = path.extname(fullPath).slice(1).toLowerCase();
    const mime =
      extension === "otf"
        ? "font/otf"
        : extension === "woff"
          ? "font/woff"
          : extension === "woff2"
            ? "font/woff2"
            : "font/ttf";
    return { dataUri: `data:${mime};base64,${buffer.toString("base64")}`, format: extension };
  } catch {
    return null;
  }
}

const registered = new Set<string>();

export async function registerCompositorPdfFonts(
  compositorPdf: CompositorPdfPayload | undefined,
): Promise<void> {
  if (!compositorPdf) return;
  const references = new Map<string, FontReference>();
  collectFontReferences(compositorPdf.roots, references);
  await Promise.all(
    [...references.values()].map(async ({ family, url }) => {
      const key = `${family}\0${url}`;
      if (registered.has(key)) return;
      const loaded = await loadUploadedFont(url);
      if (!loaded) return;
      Font.register({
        family,
        fonts: [
          { src: loaded.dataUri, fontWeight: 400, fontStyle: "normal" },
          { src: loaded.dataUri, fontWeight: 700, fontStyle: "normal" },
          { src: loaded.dataUri, fontWeight: 400, fontStyle: "italic" },
          { src: loaded.dataUri, fontWeight: 700, fontStyle: "italic" },
        ],
      });
      registered.add(key);
    }),
  );
}

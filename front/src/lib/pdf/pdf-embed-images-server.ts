import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { CompositorPdfPayload } from "@/components/pdf/compositor-pdf-types";
import { mergeCoverDocumentProps } from "@/lib/budgets/cover-document";
import { getUploadsRoot } from "@/lib/upload";
import type { Budget } from "@/types/budget-types";
import { flattenTree } from "@/types/budget-compositor-types";
import { proxyPdfImageUrlCore } from "@/lib/pdf/pdf-image-src";

const LIMIT_INPUT_PIXELS = 50_000_000;
const MAX_SIDE = 2048;

function collectImgSrcFromHtml(html: string): string[] {
    const out: string[] = [];
    const re = /<img\b[^>]*\bsrc\s*=\s*(["'])([^"']*)\1/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const s = m[2]?.trim();
        if (!s) continue;
        out.push(s.replace(/&amp;/g, "&").replace(/&quot;/g, '"'));
    }
    return out;
}

function addUrl(set: Set<string>, u?: string | null) {
    const t = u?.trim();
    if (!t || t.startsWith("blob:")) return;
    set.add(t);
}

/** Todas as URLs brutas que o PDF pode pedir (capa + cenas do orçamento). */
export function collectRawPdfImageUrlsForPdf(
    budget: Budget,
    compositorPdf?: CompositorPdfPayload,
): string[] {
    const set = new Set<string>();
    const coverBlock = compositorPdf?.roots?.length
        ? flattenTree(compositorPdf.roots).find((b) => b.type === "cover")
        : undefined;
    const cover = mergeCoverDocumentProps(coverBlock?.props as Record<string, unknown> | undefined);
    addUrl(set, cover.cover_watermark_url);
    addUrl(set, cover.document_watermark_url);
    for (const src of collectImgSrcFromHtml(cover.cover_document_html ?? "")) {
        addUrl(set, src);
    }
    for (const loc of budget.locations ?? []) {
        for (const sec of loc.sections ?? []) {
            for (const img of sec.images ?? []) {
                addUrl(set, img.composed_url);
                addUrl(set, img.url);
            }
        }
    }
    return [...set];
}

async function readUploadsFileFromPathname(pathname: string): Promise<Buffer | null> {
    const normalized = pathname.replace(/\/+/g, "/");
    const m = normalized.match(/^\/api\/uploads\/(.+)$/i);
    if (!m) return null;
    const segments = m[1].split("/").filter(Boolean);
    if (segments.some((s) => s === ".." || s.includes("\0"))) return null;
    const root = path.resolve(getUploadsRoot());
    const full = path.resolve(root, ...segments);
    if (!full.startsWith(root + path.sep)) return null;
    try {
        return await fs.readFile(full);
    } catch {
        return null;
    }
}

async function loadImageBufferForPdfEmbed(absoluteUrl: string): Promise<Buffer | null> {
    const trimmed = absoluteUrl.trim();
    if (!trimmed) return null;
    if (/^data:/i.test(trimmed)) {
        const idx = trimmed.indexOf("base64,");
        if (idx === -1) return null;
        try {
            return Buffer.from(trimmed.slice(idx + 7), "base64");
        } catch {
            return null;
        }
    }
    let u: URL;
    try {
        u = new URL(trimmed);
    } catch {
        return null;
    }
    if (u.pathname === "/api/pdf/image" || u.pathname.endsWith("/api/pdf/image")) {
        const inner = u.searchParams.get("src");
        if (!inner) return null;
        return loadImageBufferForPdfEmbed(inner);
    }
    const fromDisk = await readUploadsFileFromPathname(u.pathname);
    if (fromDisk) return fromDisk;
    try {
        const res = await fetch(trimmed, {
            cache: "no-store",
            headers: {
                Accept: "image/*,*/*;q=0.8",
                "User-Agent":
                    "Mozilla/5.0 (compatible; PaziniPdfEmbed/1.0; +https://localhost)",
            },
        });
        if (!res.ok) return null;
        return Buffer.from(await res.arrayBuffer());
    } catch {
        return null;
    }
}

async function bufferToPngDataUri(buf: Buffer): Promise<string | undefined> {
    try {
        const out = await sharp(buf, {
            animated: true,
            limitInputPixels: LIMIT_INPUT_PIXELS,
        })
            .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
            .png({ compressionLevel: 9 })
            .toBuffer();
        return `data:image/png;base64,${out.toString("base64")}`;
    } catch (e) {
        if (process.env.NODE_ENV === "development") {
            console.warn("[pdf-embed] sharp:", e);
        }
        return undefined;
    }
}

/**
 * Pré-carrega imagens no processo Node (disco + opcionalmente fetch) e devolve data URIs PNG.
 * Chaves = saída de `proxyPdfImageUrlCore` (o mesmo valor que `<Image src>` usaria sem inline).
 */
export async function buildPdfEmbeddedImagesMap(
    rawUrls: readonly string[],
    publicBase: string | undefined,
): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const base = publicBase?.trim() || undefined;
    const seenCore = new Set<string>();
    for (const raw of rawUrls) {
        const core = proxyPdfImageUrlCore(raw, base);
        if (!core || seenCore.has(core)) continue;
        seenCore.add(core);
        const buf = await loadImageBufferForPdfEmbed(core);
        if (!buf) {
            if (process.env.NODE_ENV === "development") {
                console.warn("[pdf-embed] sem dados:", core.slice(0, 160));
            }
            continue;
        }
        const dataUri = await bufferToPngDataUri(buf);
        if (dataUri) map.set(core, dataUri);
    }
    return map;
}

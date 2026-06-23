import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { ProposalSettings } from "@/actions/settings-actions";
import type { CompositorPdfPayload } from "@/components/pdf/compositor-pdf-types";
import { mergeCoverDocumentProps } from "@/lib/budgets/cover-document";
import { getUploadsRoot } from "@/lib/upload";
import type { Budget } from "@/types/budget-types";
import { flattenTree } from "@/types/budget-compositor-types";
import { proxyPdfImageUrlCore } from "@/lib/pdf/pdf-image-src";

const LIMIT_INPUT_PIXELS = 50_000_000;
/** Redimensionamento no embed: menor que o proxy HTTP para acelerar o PDF. */
const MAX_EMBED_SIDE = 1600;
const MAX_PASSTHROUGH_BYTES = 2_000_000;

function embedConcurrency(): number {
    const n = Number(process.env.PDF_EMBED_CONCURRENCY);
    if (Number.isFinite(n) && n >= 1 && n <= 16) return Math.trunc(n);
    return 6;
}

async function mapPool<T>(items: readonly T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
    if (items.length === 0) return;
    const n = Math.max(1, Math.min(concurrency, items.length));
    let index = 0;
    await Promise.all(
        Array.from({ length: n }, async () => {
            while (true) {
                const i = index++;
                if (i >= items.length) break;
                await fn(items[i]!);
            }
        }),
    );
}

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

function collectCompositorHtmlImageUrls(compositorPdf?: CompositorPdfPayload): string[] {
    if (!compositorPdf?.roots?.length) return [];
    const out = new Set<string>();
    const flat = flattenTree(compositorPdf.roots);
    for (const block of flat) {
        const props = (block.props ?? {}) as Record<string, unknown>;
        if (block.type === "cover") {
            for (const src of collectImgSrcFromHtml(String(props.cover_document_html ?? ""))) {
                out.add(src);
            }
            continue;
        }
        if (block.type === "header_footer") {
            for (const key of ["cover_header_html", "cover_footer_html", "inner_header_html", "inner_footer_html"]) {
                for (const src of collectImgSrcFromHtml(String(props[key] ?? ""))) {
                    out.add(src);
                }
            }
            for (const src of collectHeaderFooterLayoutImageUrls(props)) {
                out.add(src);
            }
            continue;
        }
        if (block.type === "session" || block.type === "location" || block.type === "section") {
            for (const src of collectImgSrcFromHtml(String(props.description ?? ""))) {
                out.add(src);
            }
            continue;
        }
        if (block.type === "text") {
            for (const src of collectImgSrcFromHtml(String(props.content ?? props.description ?? ""))) {
                out.add(src);
            }
        }
    }
    return [...out];
}

function collectHeaderFooterLayoutImageUrls(props: Record<string, unknown>): string[] {
    const out: string[] = [];
    const fields = [
        "all_header_layout",
        "all_footer_layout",
        "cover_header_layout",
        "cover_footer_layout",
        "inner_header_layout",
        "inner_footer_layout",
    ];
    for (const field of fields) {
        const layout = props[field];
        if (!layout || typeof layout !== "object") continue;
        const elements = (layout as { elements?: unknown }).elements;
        if (!Array.isArray(elements)) continue;
        for (const element of elements) {
            if (!element || typeof element !== "object") continue;
            const src = (element as { src?: unknown }).src;
            if (typeof src === "string" && src.trim()) out.push(src);
        }
    }
    return out;
}

function addUrl(set: Set<string>, u?: string | null) {
    const t = u?.trim();
    if (!t || t.startsWith("blob:")) return;
    set.add(t);
}

function asOptionalString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

/** Todas as URLs brutas que o PDF pode pedir (capa + cenas do orçamento + logo do cabeçalho). */
export function collectRawPdfImageUrlsForPdf(
    budget: Budget,
    compositorPdf?: CompositorPdfPayload,
    settings?: ProposalSettings | null,
): string[] {
    const set = new Set<string>();
    const flat = compositorPdf?.roots?.length ? flattenTree(compositorPdf.roots) : [];
    const coverBlock = flat.find((b) => b.type === "cover");
    const headerFooterBlock = flat.find((b) => b.type === "header_footer");
    const cover = mergeCoverDocumentProps(coverBlock?.props as Record<string, unknown> | undefined);
    const headerFooter = (headerFooterBlock?.props ?? {}) as Record<string, unknown>;
    addUrl(set, cover.cover_watermark_url);
    addUrl(set, cover.document_watermark_url);
    addUrl(set, asOptionalString(headerFooter.cover_watermark_url));
    addUrl(set, asOptionalString(headerFooter.inner_watermark_url));
    addUrl(set, cover.client_logo_url);
    addUrl(set, cover.cover_pdf_header_logo_url_override);
    if (settings?.company_logo_url?.trim()) {
        addUrl(set, settings.company_logo_url);
    }
    for (const src of collectImgSrcFromHtml(cover.cover_document_html ?? "")) {
        addUrl(set, src);
    }
    for (const src of collectCompositorHtmlImageUrls(compositorPdf)) {
        addUrl(set, src);
    }
    const imagesByBlock = compositorPdf?.imagesByBlock ?? {};
    for (const arr of Object.values(imagesByBlock)) {
        for (const img of arr ?? []) {
            const row = img as { composed_url?: string; url?: string };
            addUrl(set, row.composed_url || row.url);
        }
    }
    for (const loc of budget.locations ?? []) {
        for (const img of loc.images ?? []) {
            addUrl(set, img.composed_url || img.url);
        }
        for (const sec of loc.sections ?? []) {
            for (const img of sec.images ?? []) {
                addUrl(set, img.composed_url || img.url);
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

/**
 * Pass-through rápido para PNG/JPEG já pequenos; senão um único pipeline Sharp (PNG nível 6).
 */
async function bufferToEmbedDataUri(buf: Buffer): Promise<string | undefined> {
    try {
        if (buf.length <= MAX_PASSTHROUGH_BYTES) {
            const meta = await sharp(buf, { limitInputPixels: LIMIT_INPUT_PIXELS }).metadata();
            const w = meta.width ?? 0;
            const h = meta.height ?? 0;
            const fmt = meta.format;
            if (
                (fmt === "png" || fmt === "jpeg" || fmt === "jpg") &&
                w > 0 &&
                h > 0 &&
                w <= MAX_EMBED_SIDE &&
                h <= MAX_EMBED_SIDE
            ) {
                const mime = fmt === "png" ? "image/png" : "image/jpeg";
                return `data:${mime};base64,${buf.toString("base64")}`;
            }
        }
        const out = await sharp(buf, {
            animated: true,
            limitInputPixels: LIMIT_INPUT_PIXELS,
        })
            .resize(MAX_EMBED_SIDE, MAX_EMBED_SIDE, { fit: "inside", withoutEnlargement: true })
            .png({ compressionLevel: 6 })
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
/** Evita data URIs gigantes que podem derrubar o layout do React-PDF (~6MB base64). */
const MAX_EMBED_DATA_URI_CHARS = 6_000_000;

export async function buildPdfEmbeddedImagesMap(
    rawUrls: readonly string[],
    publicBase: string | undefined,
): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const base = publicBase?.trim() || undefined;
    const seenCore = new Set<string>();
    const cores: string[] = [];
    for (const raw of rawUrls) {
        const core = proxyPdfImageUrlCore(raw, base);
        if (!core || seenCore.has(core)) continue;
        seenCore.add(core);
        cores.push(core);
    }
    const conc = embedConcurrency();
    await mapPool(cores, conc, async (core) => {
        const buf = await loadImageBufferForPdfEmbed(core);
        if (!buf) {
            if (process.env.NODE_ENV === "development") {
                console.warn("[pdf-embed] sem dados:", core.slice(0, 160));
            }
            return;
        }
        const dataUri = await bufferToEmbedDataUri(buf);
        if (!dataUri || dataUri.length > MAX_EMBED_DATA_URI_CHARS) {
            if (process.env.NODE_ENV === "development" && dataUri && dataUri.length > MAX_EMBED_DATA_URI_CHARS) {
                console.warn("[pdf-embed] imagem demasiado grande para inline, usa URL:", core.slice(0, 120));
            }
            return;
        }
        out[core] = dataUri;
    });
    return out;
}

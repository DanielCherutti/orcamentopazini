import sharp from "sharp";
import { readUploadFile } from "@/lib/delivery/delivery-upload-files";
import { proxyPdfImageUrlCore } from "@/lib/pdf/pdf-image-src";

const LIMIT_INPUT_PIXELS = 50_000_000;
const MAX_EMBED_SIDE = 1200;
const MAX_PASSTHROUGH_BYTES = 2_000_000;

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
            .rotate()
            .resize(MAX_EMBED_SIDE, MAX_EMBED_SIDE, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 82, mozjpeg: true })
            .toBuffer();
        return `data:image/jpeg;base64,${out.toString("base64")}`;
    } catch {
        return undefined;
    }
}

function isImageEvidence(type: string, filename: string): boolean {
    const t = type.toLowerCase();
    if (t.startsWith("image/")) return true;
    return /\.(jpe?g|png|gif|webp|bmp)$/i.test(filename);
}

/**
 * Pré-carrega imagens de evidências (e logo da empresa) como data URIs para o React-PDF.
 */
export async function embedDeliveryPdfImages(
    urls: string[],
    options?: { publicBase?: string },
): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];

    await Promise.all(
        unique.map(async (url) => {
            const buf = await readUploadFile(url);
            if (buf) {
                const dataUri = await bufferToEmbedDataUri(buf);
                if (dataUri) {
                    out[url] = dataUri;
                    const proxied = proxyPdfImageUrlCore(url, options?.publicBase);
                    if (proxied) out[proxied] = dataUri;
                }
                return;
            }

            const proxied = proxyPdfImageUrlCore(url, options?.publicBase);
            if (!proxied || !/^https?:\/\//i.test(proxied)) return;
            try {
                const res = await fetch(proxied, {
                    cache: "no-store",
                    headers: { Accept: "image/*,*/*;q=0.8" },
                });
                if (!res.ok) return;
                const remoteBuf = Buffer.from(await res.arrayBuffer());
                const dataUri = await bufferToEmbedDataUri(remoteBuf);
                if (dataUri) {
                    out[url] = dataUri;
                    out[proxied] = dataUri;
                }
            } catch {
                /* ignore */
            }
        }),
    );

    return out;
}

export function collectDeliveryEvidenceImageUrls(
    evidences: { url: string; type: string; filename: string }[],
): string[] {
    return evidences
        .filter((ev) => isImageEvidence(ev.type, ev.filename))
        .map((ev) => ev.url);
}

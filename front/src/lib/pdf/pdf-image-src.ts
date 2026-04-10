/**
 * Resolve URLs de imagem para o React-PDF e força o proxy `/api/pdf/image`
 * (redimensiona e limita pixels) para evitar dimensões absurdas no layout Yoga.
 *
 * No Node, `fetch` do @react-pdf/image exige URL **absoluta**; caminhos `/api/...` sem origin falham em silêncio no layout.
 */

function trimOrigin(base: string | undefined): string | undefined {
    const t = base?.trim();
    return t ? t.replace(/\/$/, "") : undefined;
}

/** Fallback quando não há `window` nem `app_public_url` (ex.: workers sem Host). */
export function pdfImageOriginFromEnv(): string | undefined {
    if (typeof window !== "undefined") return undefined;
    const fromPublic = trimOrigin(process.env.NEXT_PUBLIC_APP_URL);
    if (fromPublic) return fromPublic;
    const vercel = process.env.VERCEL_URL?.trim();
    if (vercel) return trimOrigin(`https://${vercel.replace(/^https?:\/\//, "")}`);
    return undefined;
}

function effectiveOrigin(publicBase?: string): string | undefined {
    if (typeof window !== "undefined" && window.location?.origin) {
        return window.location.origin;
    }
    return trimOrigin(publicBase) ?? pdfImageOriginFromEnv();
}

export function resolvePdfImageSrc(url: string | undefined, publicBase?: string): string | undefined {
    const u = url?.trim();
    if (!u) return undefined;
    if (/^data:/i.test(u)) return u;
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith("//")) return `https:${u}`;
    const origin = effectiveOrigin(publicBase);
    if (u.startsWith("/")) return origin ? `${origin}${u}` : u;
    if (origin) return `${origin}/${u.replace(/^\.?\//, "")}`;
    return `/${u.replace(/^\.?\//, "")}`;
}

/** URL final passada ao `<Image src>` antes de substituição por data URI (servidor). */
export function proxyPdfImageUrlCore(url: string | undefined, publicBase?: string): string | undefined {
    const resolved = resolvePdfImageSrc(url, publicBase);
    if (!resolved || /^data:/i.test(resolved)) return resolved;
    if (resolved.includes("/api/pdf/image?src=")) return resolved;
    const origin = effectiveOrigin(publicBase);
    if (!origin) return resolved;
    return `${origin}/api/pdf/image?src=${encodeURIComponent(resolved)}`;
}

/** URL proxy (core) → data URI. Objeto plano evita surpresas com `Map` nas props do React-PDF. */
export type PdfEmbeddedImages = Readonly<Record<string, string>>;

/**
 * `embedded`: mapa URL final (core) → `data:image/png;base64,...` gerado no servidor
 * para o React-PDF não depender de `fetch` HTTP durante `renderToBuffer`.
 */
export function proxyPdfImageSrc(
    url: string | undefined,
    publicBase?: string,
    embedded?: PdfEmbeddedImages,
): string | undefined {
    const core = proxyPdfImageUrlCore(url, publicBase);
    if (!core) return undefined;
    const inlined = embedded && Object.prototype.hasOwnProperty.call(embedded, core) ? embedded[core] : undefined;
    if (inlined) return inlined;
    /**
     * Sem data URI embutido: preferir URL absoluta direta (ex. `/api/uploads/...`) em vez do proxy
     * `/api/pdf/image?src=...`. Durante `renderToBuffer` na mesma instância Node, um fetch ao proxy
     * pode falhar ou devolver vazio; o ficheiro em disco continua acessível pela rota de uploads.
     */
    const direct = resolvePdfImageSrc(url, publicBase);
    if (direct && /^https?:\/\//i.test(direct)) {
        return direct;
    }
    return core;
}

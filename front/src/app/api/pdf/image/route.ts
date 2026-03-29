import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

const PASSTHROUGH_TYPES = new Set(["image/png", "image/jpeg", "image/jpg"]);

function getRequestOrigin(request: NextRequest): string | undefined {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  if (!host) return undefined;
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto =
    forwardedProto || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

function resolveSourceUrl(rawSrc: string, request: NextRequest): string | undefined {
  const src = rawSrc.trim();
  if (!src) return undefined;
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith("//")) return `https:${src}`;
  const origin = getRequestOrigin(request);
  if (src.startsWith("/")) {
    return origin ? `${origin}${src}` : undefined;
  }
  // Caminho relativo sem "/" inicial (ex.: "api/uploads/..").
  if (origin) return `${origin}/${src.replace(/^\.?\//, "")}`;
  return undefined;
}

export async function GET(request: NextRequest) {
  const srcParam = request.nextUrl.searchParams.get("src");
  if (!srcParam) {
    return NextResponse.json({ error: "Missing src" }, { status: 400 });
  }

  const sourceUrl = resolveSourceUrl(srcParam, request);
  if (!sourceUrl) {
    return NextResponse.json({ error: "Invalid src" }, { status: 400 });
  }

  try {
    const sourceOrigin = (() => {
      try {
        return new URL(sourceUrl).origin;
      } catch {
        return undefined;
      }
    })();

    const upstream = await fetch(sourceUrl, {
      headers: {
        Accept: "image/*,*/*;q=0.8",
        // Alguns CDNs anti-hotlink respondem 403 sem cabeçalhos de navegador.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        ...(sourceOrigin ? { Referer: `${sourceOrigin}/` } : {}),
        ...(sourceOrigin ? { Origin: sourceOrigin } : {}),
      },
      cache: "no-store",
    });

    if (!upstream.ok) {
      // Fallback: se o host bloquear fetch server-side, tenta carregamento direto no cliente.
      if (upstream.status === 401 || upstream.status === 403) {
        return NextResponse.redirect(sourceUrl, 307);
      }
      return NextResponse.json({ error: "Image not found" }, { status: upstream.status });
    }

    const inputBuffer = Buffer.from(await upstream.arrayBuffer());
    const contentType = (upstream.headers.get("content-type") || "application/octet-stream")
      .split(";")[0]
      .toLowerCase();

    if (PASSTHROUGH_TYPES.has(contentType)) {
      return new NextResponse(inputBuffer, {
        headers: {
          "Content-Type": contentType === "image/jpg" ? "image/jpeg" : contentType,
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const pngBuffer = await sharp(inputBuffer, {
      animated: true,
      limitInputPixels: false,
    })
      .png()
      .toBuffer();

    return new NextResponse(pngBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("pdf image proxy failed:", error);
    return NextResponse.json({ error: "Failed to process image" }, { status: 500 });
  }
}

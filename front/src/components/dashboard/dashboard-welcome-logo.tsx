"use client";

import Image from "next/image";
import { DraftingCompass } from "lucide-react";
import { useState } from "react";

const DEFAULT_LOGO = "/logo.jpeg";

function shouldUsePlainImg(src: string): boolean {
  const s = src.toLowerCase();
  return (
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("data:image/") ||
    s.startsWith("/api/uploads/")
  );
}

/**
 * Logo do cartão de boas-vindas: URLs externas e data URI usam `<img>` porque o
 * `next/image` exige `remotePatterns` por host — URLs vindas de Configurações são arbitrárias.
 */
export function DashboardWelcomeLogo({
  logoUrl,
  alt = "Logomarca",
}: {
  /** De settings, env ou vazio para o arquivo em /public */
  logoUrl?: string | null;
  alt?: string;
}) {
  const raw = typeof logoUrl === "string" ? logoUrl.trim() : "";
  const src = raw || DEFAULT_LOGO;
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;
  const loaded = loadedSrc === src && !failed;
  const imageClassName = "h-full w-full object-contain p-1";

  return (
    <div
      className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-white"
      data-logo-state={failed ? "fallback" : loaded ? "ready" : "loading"}
      role={failed && alt ? "img" : undefined}
      aria-label={failed && alt ? alt : undefined}
    >
      {failed ? (
        <div
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/15 via-muted/60 to-secondary/15 text-primary"
          aria-hidden="true"
          data-testid="platform-logo-fallback"
        >
          <DraftingCompass className="h-8 w-8" strokeWidth={1.8} />
        </div>
      ) : null}
      {!failed && shouldUsePlainImg(src) ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL externa, upload ou Data URI da configuração
        <img
          src={src}
          alt={alt}
          className={imageClassName}
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
        />
      ) : !failed ? (
        <Image
          src={src}
          alt={alt}
          fill
          className={imageClassName}
          sizes="64px"
          priority
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
        />
      ) : null}
    </div>
  );
}

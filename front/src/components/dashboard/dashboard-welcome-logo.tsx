import Image from "next/image";

const DEFAULT_LOGO = "/logo.jpeg";

function isRemoteOrDataUrl(src: string): boolean {
  const s = src.toLowerCase();
  return (
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("data:image/")
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

  return (
    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/40">
      {isRemoteOrDataUrl(src) ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL externa/Data URI da configuração
        <img src={src} alt={alt} className="h-full w-full object-contain p-1.5" />
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          className="object-contain p-1.5"
          sizes="64px"
          priority
        />
      )}
    </div>
  );
}

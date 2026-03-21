import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Garante URL absoluta para imagens, evitando falhas em diferentes ambientes/hosts.
 * URLs relativas (/api/uploads/...) são convertidas para absolutas usando o origin atual.
 */
export function toAbsoluteImageUrl(url: string | undefined | null): string | null {
  if (!url || typeof url !== "string" || url.trim() === "") return null
  const trimmed = url.trim()
  if (trimmed.startsWith("data:")) return trimmed // data URLs já são válidas
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed
  if (typeof window !== "undefined" && trimmed.startsWith("/")) {
    return `${window.location.origin}${trimmed}`
  }
  return trimmed
}

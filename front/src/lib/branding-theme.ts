import type { CSSProperties } from "react";

/** Padrão alinhado às configurações iniciais de proposta (cor primária / secundária). */
export const BRAND_DEFAULT_PRIMARY = "#1e3a8a";
export const BRAND_DEFAULT_SECONDARY = "#ea580c";

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Valida e normaliza hex (#RGB ou #RRGGBB). Retorna undefined se inválido (evita injeção em `style`).
 */
export function normalizeHex(input: string | undefined | null): string | undefined {
  if (input == null || typeof input !== "string") return undefined;
  const t = input.trim();
  if (!HEX_RE.test(t)) return undefined;
  if (t.length === 4) {
    const r = t[1]!;
    const g = t[2]!;
    const b = t[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return t.toLowerCase();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = normalizeHex(hex);
  if (!h) return { r: 0, g: 0, b: 0 };
  return {
    r: Number.parseInt(h.slice(1, 3), 16),
    g: Number.parseInt(h.slice(3, 5), 16),
    b: Number.parseInt(h.slice(5, 7), 16),
  };
}

/** Canal sRGB linearizado (luminância relativa). */
function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** Texto legível sobre fundo `hex` (aproximação WCAG). */
export function contrastForegroundForHex(hex: string): "#ffffff" | "#0f172a" {
  return relativeLuminance(hex) > 0.45 ? "#0f172a" : "#ffffff";
}

/** Espaçado para `rgb(var(--x) / <alpha>)` ou color-mix. */
export function hexToRgbSpaceSeparated(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

/**
 * Variáveis CSS para alinhar o app às cores de Configurações (primária / secundária em hex).
 * Ajusta `--primary`, `--primary-foreground`, sidebar e foco; `--brand-secondary` para detalhes de marca.
 */
export function brandingCSSProperties(
  primaryHex?: string | null,
  secondaryHex?: string | null
): CSSProperties {
  const p = normalizeHex(primaryHex ?? undefined) ?? BRAND_DEFAULT_PRIMARY;
  const s = normalizeHex(secondaryHex ?? undefined) ?? BRAND_DEFAULT_SECONDARY;
  const fg = contrastForegroundForHex(p);
  const prgb = hexToRgbSpaceSeparated(p);
  const srgb = hexToRgbSpaceSeparated(s);

  return {
    "--primary": p,
    "--primary-foreground": fg,
    "--sidebar-primary": p,
    "--sidebar-ring": p,
    "--ring": p,
    "--primary-rgb": prgb,
    "--brand-secondary": s,
    "--brand-secondary-rgb": srgb,
  } as CSSProperties;
}

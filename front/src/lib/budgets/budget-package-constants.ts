/** Versão do formato de pacote `.pazini.zip` (manifest.json + files/). */
export const BUDGET_PACKAGE_VERSION = 1;

export const BUDGET_PACKAGE_MANIFEST = "manifest.json";

export const BUDGET_PACKAGE_FILES_PREFIX = "files/";

/**
 * - data: só manifest (estrutura + URLs). Ideal para muitos orçamentos; imagens exigem pasta uploads já copiada no destino.
 * - compact: imagens redimensionadas (JPEG), sem arquivos composed_url (gerados de novo no destino).
 * - full: arquivos originais, incluindo composed_url (pacotes muito grandes).
 */
export type BudgetPackageExportMode = "data" | "compact" | "full";

export const BUDGET_PACKAGE_EXPORT_MODES: BudgetPackageExportMode[] = ["data", "compact", "full"];

export const DEFAULT_BUDGET_PACKAGE_EXPORT_MODE: BudgetPackageExportMode = "data";

/** Compact: maior aresta em px; JPEG quality 1–100. */
export const BUDGET_PACKAGE_COMPACT_MAX_EDGE = 1400;
export const BUDGET_PACKAGE_COMPACT_JPEG_QUALITY = 82;

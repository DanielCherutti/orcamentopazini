/**
 * Utilitários para URLs de orçamentos.
 * Padrão: /budgets/budget/{uuid} (sem prefixo "budget:" na URL)
 */

/** Extrai o ID para uso na URL (apenas a parte após ":" se existir) */
export function budgetIdToPath(id: string): string {
  if (!id) return "";
  return id.includes(":") ? id.split(":")[1] : id;
}

/** Monta a URL do orçamento para edição */
export function budgetEditUrl(id: string): string {
  return `/budgets/budget/${budgetIdToPath(id)}`;
}

/** Abre o workspace do orçamento na aba E-mail. */
export function budgetEditEmailUrl(id: string): string {
  return `${budgetEditUrl(id)}?tab=email`;
}

/** Monta a URL da página de visualização do PDF (shell com iframe). */
export function budgetPdfUrl(id: string): string {
  return `/budgets/budget/${budgetIdToPath(id)}/pdf`;
}

/** Stream PDF gerado no servidor (cookies de sessão enviados no mesmo site). */
export function budgetPdfApiUrl(id: string): string {
  return `/api/budgets/${budgetIdToPath(id)}/pdf`;
}

/** Caminho para revalidatePath (página de edição do orçamento) */
export function budgetRevalidatePath(id: string): string {
  return `/budgets/budget/${budgetIdToPath(id)}`;
}

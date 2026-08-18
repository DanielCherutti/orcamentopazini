/**
 * Conteúdo pertencente à estrutura editável do compositor. Ao importar um
 * modelo completo, esses blocos são substituídos pelos blocos do modelo.
 * Capa, cabeçalho/rodapé, índices e orçamento são raízes fixas reutilizadas.
 */
export const BUDGET_MODEL_REPLACED_BLOCK_TYPES = [
  "session",
  "text",
  "scope",
  "location",
  "section",
  "terms",
] as const;

export function isBudgetModelReplacedBlockType(type: string): boolean {
  return (BUDGET_MODEL_REPLACED_BLOCK_TYPES as readonly string[]).includes(type);
}

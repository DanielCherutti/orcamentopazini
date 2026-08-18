const PROTECTED_BUDGET_BLOCK_TYPES = new Set([
  "cover",
  "header_footer",
  "figures",
  "toc",
  "quote",
]);

export function canDeleteBudgetCompositorBlock(type: string): boolean {
  return !PROTECTED_BUDGET_BLOCK_TYPES.has(type);
}

/**
 * Novidades exibidas no login (`/`). Atualize este arquivo a cada release ou entrega relevante.
 * Mantenha textos curtos e em linguagem de usuário (sem jargão técnico desnecessário).
 */
export type LoginHighlightKind = "feature" | "improvement" | "fix";

export type LoginHighlight = {
  /** Título curto (uma linha) */
  title: string;
  /** Detalhe opcional (1–2 frases) */
  description?: string;
  kind?: LoginHighlightKind;
  /** ISO date YYYY-MM-DD — exibida em pt-BR quando presente */
  date?: string;
};

export const LOGIN_HIGHLIGHTS_TITLE = "Novidades no sistema";
export const LOGIN_HIGHLIGHTS_SUBTITLE =
  "Confira o que melhoramos recentemente para o dia a dia da operação.";

/** Ordem: mais recente primeiro (para leitura). */
export const loginHighlights: LoginHighlight[] = [
  {
    kind: "feature",
    date: "2026-03-21",
    title: "Painel Início com números e atalhos",
    description:
      "Na área logada, a página Início mostra totais de produtos, grupos, orçamentos e clientes, atalhos rápidos e os orçamentos mais recentes.",
  },
  {
    kind: "improvement",
    date: "2026-03-21",
    title: "Cores da sua marca no login e no painel",
    description:
      "As cores primária e secundárias definidas em Configurações passam a refletir na tela de entrada, menu e destaques da interface.",
  },
  {
    kind: "improvement",
    date: "2026-03-21",
    title: "Catálogo e listagens mais claras",
    description:
      "Busca, tabelas e cartões de produtos e grupos com visual mais organizado e estados vazios mais informativos.",
  },
  {
    kind: "improvement",
    date: "2026-03-21",
    title: "Login mais moderno e acessível",
    description:
      "Nova página de entrada com melhor hierarquia visual, mensagens de erro organizadas e foco nos campos.",
  },
];

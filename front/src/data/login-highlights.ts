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
    kind: "fix",
    date: "2026-03-21",
    title: "Grupo no escopo na ordem certa",
    description:
      "Ao adicionar um grupo de produtos em um trecho do escopo, os itens do grupo passam a entrar depois dos que já estavam naquele trecho — não mais no topo da lista.",
  },
  {
    kind: "feature",
    date: "2026-03-25",
    title: "Novos usuários por convite no e-mail",
    description:
      "Em Configurações → Usuários, informe o e-mail; a pessoa recebe um link para criar a senha. A URL pública do site e o SMTP ficam em Configurações da empresa → E-mail (convites). O administrador pode definir ou alterar senha pelo painel quando precisar.",
  },
  {
    kind: "feature",
    date: "2026-03-25",
    title: "Status do orçamento: Em andamento e Finalizado",
    description:
      "Na lista, cada orçamento exibe o status com badges (Em andamento, Finalizado, Enviado…), com a coluna Status centralizada. No workspace, o botão Finalizar encerra a edição: dali em diante é só visualização, pré-visualização e PDF — como nos outros status fechados. Para voltar a editar, duplique na lista.",
  },
  {
    kind: "feature",
    date: "2026-03-25",
    title: "Excluir orçamento em andamento",
    description:
      "Na lista de orçamentos, a lixeira aparece só para quem está Em andamento e pede confirmação antes de apagar. Orçamentos finalizados ou já fechados (enviado, aprovado, recusado) não podem ser excluídos por essa via.",
  },
  {
    kind: "improvement",
    date: "2026-03-24",
    title: "Escopo e orçamento: mesma lógica de pai e filho na tela",
    description:
      "Escopo e Ambientes: o índice mantém todos os trechos visíveis; o ambiente abre todos no painel (como antes no escopo) e o trecho abre só ele. Orçamento com compositor: sessão “pai” mostra tudo abaixo (subsessões, locais…); subsessão, local ou trecho mostra só aquele ramo. Para ver todas as raízes no compositor, selecione o bloco ESCOPO ou um tipo fora sessão/local/trecho.",
  },
  {
    kind: "improvement",
    date: "2026-03-23",
    title: "Editor de fotos do trecho: aba Grupo e atalho no catálogo",
    description:
      "A aba Grupo mostra os grupos ligados ao orçamento (com carregamento corrigido). O ícone na barra ao lado da lixeira exibe todos os grupos cadastrados quando precisar, expande vários de uma vez, deixa vários abertos ao mesmo tempo e não altera a visibilidade do painel lateral de itens.",
  },
  {
    kind: "fix",
    date: "2026-03-22",
    title: "Seleção de produto no orçamento mais estável",
    description:
      "Ao adicionar produto no escopo do orçamento, a busca não fecha o modal ao clicar na lista; o painel de resultados fica compacto, com rolagem e dentro da tela.",
  },
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

export type LoginHighlightKind = "feature" | "improvement" | "fix";

export type LoginHighlight = {
  title: string;
  description?: string;
  kind?: LoginHighlightKind;
  date?: string;
};

export const LOGIN_HIGHLIGHTS_TITLE = "Novidades no sistema";
export const LOGIN_HIGHLIGHTS_SUBTITLE =
  "Confira o que melhoramos recentemente para o dia a dia da operação.";

export const loginHighlights: LoginHighlight[] = [
  {
    kind: "improvement",
    date: "2026-04-01",
    title: "Escopo e orçamento: quantidade com entrada mais confiável",
    description:
      "Os campos de quantidade passaram a usar o componente dedicado QuantityTextInput, com melhor controle do que é digitado e validação mais previsível.",
  },
  {
    kind: "improvement",
    date: "2026-04-01",
    title: "Listas de itens mais leves no navegador",
    description:
      "Virtualização nas listas de itens do escopo e fluxos relacionados para melhor desempenho quando há muitos produtos; dependências do front atualizadas.",
  },
  {
    kind: "feature",
    date: "2026-04-01",
    title: "Compositor: capa automática da proposta",
    description:
      "Todo documento compositor ganha um bloco CAPA na raiz (não pode ser excluído). Lá você personaliza títulos, URL da logomarca do cliente, marcas d’água da capa e do restante do PDF (opacidade), dados cadastrais do cliente, responsável/CREA e cidade da data. O código do orçamento e a data de emissão vêm do cadastro da proposta; dá para informar revisão (ex.: Rev. 02) e preencher dados do cliente com um clique a partir do cadastro.",
  },
  {
    kind: "improvement",
    date: "2026-04-01",
    title: "Anotador: ferramenta ativa até você trocar",
    description:
      "Seta, retângulo, linha, numeração, texto, figurinha e demais ferramentas permanecem selecionadas após cada uso. Só voltam para “Selecionar” se você escolher outra ferramenta, ao clicar numa anotação já existente ou ao trocar de imagem.",
  },
  {
    kind: "feature",
    date: "2026-04-01",
    title: "Figuras na foto: nome obrigatório",
    description:
      "No diálogo Inserir figura, o campo Nome da figura é obrigatório antes de escolher produto ou item da biblioteca. Se você arrastar item do catálogo ou do orçamento para a imagem, abre uma confirmação com o mesmo campo (sugestão preenchida quando houver nome do item) antes de concluir a inserção.",
  },
  {
    kind: "improvement",
    date: "2026-04-01",
    title: "Orçamentos na entrada, Compositor na edição",
    description:
      "Início, menu e listagem falam em Orçamentos. Dentro do workspace, a aba de montagem do documento e os textos desse fluxo usam Compositor — para separar a lista do modo de edição.",
  },
  {
    kind: "improvement",
    date: "2026-03-27",
    title: "Foto do trecho: zoom e posição lembrados",
    description:
      "Ao reabrir o anotador, o zoom e o deslocamento da imagem voltam como você deixou ao salvar (manual ou autosave).",
  },
  {
    kind: "improvement",
    date: "2026-03-27",
    title: "Adicionar grupo: lista de produtos recolhida",
    description:
      "No modal de grupos, cada kit começa fechado com uma seta para expandir e ver os produtos; dá para marcar “Selecionar disponíveis” sem abrir a lista.",
  },
  {
    kind: "feature",
    date: "2026-03-27",
    title: "Escopo: botão Adicionar descrição",
    description:
      "Ao lado de Adicionar produto e Adicionar grupo, um atalho abre a descrição do trecho (por padrão recolhida quando está vazia) e leva o foco até o editor.",
  },
  {
    kind: "improvement",
    date: "2026-03-27",
    title: "Escopo: botões de ação na cor primária",
    description:
      "Adicionar produto, Adicionar grupo de produtos e Adicionar descrição usam o azul da marca para ficarem consistentes com o restante do sistema.",
  },
  {
    kind: "improvement",
    date: "2026-03-27",
    title: "Grupos no escopo mais fáceis de ler",
    description:
      "Cada bloco de grupo ganhou moldura leve, trilho à esquerda e um rodapé “Fim do grupo” espelhando o título, para ver claramente onde o kit termina.",
  },
  {
    kind: "fix",
    date: "2026-03-27",
    title: "Duplicar trecho igual ao original",
    description:
      "Ao duplicar um trecho, ordem dos itens, grupos, quantidades, textos do produto e notas são copiados como na lista — inclusive mais de um uso do mesmo grupo no mesmo trecho.",
  },
  {
    kind: "fix",
    date: "2026-03-26",
    title: "Primeiro acesso pelo convite",
    description:
      "Quem recebe o e-mail de convite consegue definir a senha e concluir o cadastro pelo link sem a mensagem genérica de falha que aparecia antes.",
  },
  {
    kind: "improvement",
    date: "2026-03-26",
    title: "Clientes: CNPJ completa o endereço",
    description:
      "Ao informar o CNPJ e sair do campo, além da razão social o sistema preenche CEP, logradouro, número, complemento, bairro, cidade e UF quando a consulta pública trouxer esses dados.",
  },
  {
    kind: "improvement",
    date: "2026-03-26",
    title: "Clientes: ordem do formulário",
    description:
      "Depois de Dados da empresa vem Endereço; a seção Contato (responsável, telefone e e-mail) fica por último, antes de salvar.",
  },
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
    title: "Escopo e compositor: mesma lógica de pai e filho na tela",
    description:
      "Escopo e Ambientes: o índice mantém todos os trechos visíveis; o ambiente abre todos no painel (como antes no escopo) e o trecho abre só ele. Na aba Compositor: sessão “pai” mostra tudo abaixo (subsessões, locais…); subsessão, local ou trecho mostra só aquele ramo. Para ver todas as raízes no compositor, selecione o bloco ESCOPO ou um tipo fora sessão/local/trecho.",
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

# Hub da página Início do dashboard

## 1. Contexto e Objetivo
- **Contexto:** A rota `/dashboard` hoje exibe apenas boas-vindas estáticas, com pouco valor operacional.
- **Objetivo:** Transformar a **Início** em um **painel** que resume o negócio (números-chave), facilita acesso rápido aos fluxos principais e mostra **orçamentos recentes** com link direto ao workspace.
- **Escopo:** Apenas usuários autenticados; mesmos dados já visíveis nas listagens existentes (sem novas permissões por perfil nesta entrega).

## 2. Requisitos Funcionais
- A página **Início** exibe **quatro indicadores numéricos**: total de **produtos** (mesmo escopo da listagem por empresa), **grupos de produtos**, **orçamentos** e **clientes**.
- Cada indicador é **acessível como atalho** para a listagem correspondente (mesmas URLs já usadas no menu).
- A página exibe uma seção **Orçamentos recentes** com até **5** registros, ordenados do **mais recente** para o mais antigo (por data de criação).
- Cada linha de orçamento recente mostra identificação legível (código e/ou título) e leva ao **workspace** daquele orçamento.
- A página oferece **atalhos explícitos** para fluxos frequentes: novo orçamento, novo produto, novo cliente e acesso a grupos de produtos (além dos links nos indicadores).
- Se a leitura dos dados falhar, a interface **não interrompe a sessão**: exibe mensagem discreta e, quando possível, contagens zeradas ou seção vazia.

## 3. Contratos e Interfaces
- **Entrada:** Nenhuma da parte do usuário; dados carregados no servidor na renderização da rota.
- **Saída (visível):** Números inteiros não negativos; lista de até 5 orçamentos com texto de apoio e links válidos.
- **Comportamento:** Contagens e lista devem refletir o estado atual do banco no momento da requisição (sem cache agressivo que desatualize por longos períodos além do padrão da aplicação).

## 4. Fluxos e Estados
- **Feliz:** Usuário autenticado abre `/dashboard` e vê indicadores, atalhos e lista recente coerentes com os dados.
- **Sem orçamentos:** Seção de recentes indica estado vazio e oferece caminho para a listagem ou criação.
- **Erro de banco:** Mensagem amigável; evitar detalhes técnicos ou vazamento de informação.

## 5. Dados
- Reutilizar tabelas e filtros já adotados nas actions de produto, grupo, orçamento e cliente (ex.: `company_id` dos produtos/grupos alinhado ao catálogo atual).
- Nenhuma migração de esquema.

## 6. NFRs
- **Performance:** Preferir consultas agregadas ou mínimas (contagens e campos necessários para a lista recente), evitando carregar catálogos inteiros só para o painel.
- **Segurança:** Somente com sessão válida; mesmas regras das demais actions de leitura.

## 7. Guardrails
- Reutilizar utilitários de URL de orçamento já existentes para consistência com o restante do app.
- Manter alinhamento visual com o shell já usado nas demais páginas internas.

## 8. Critérios de aceite
- Indicadores batem com as contagens esperadas para um ambiente de teste (produtos/grupos com filtro de empresa; clientes e orçamentos globais como nas listagens atuais).
- Clicar em um orçamento recente abre o workspace correto.
- Atalhos levam às rotas corretas de criação ou listagem.
- Usuário não autenticado não acessa o painel (comportamento igual ao restante do dashboard).

## 9. Testes
- **Manual:** Validar contagens após criar/excluir entidades de teste; validar links e lista vazia.

## 10. Migração / Rollback
- Não há migração. Rollback: reverter deploy que inclua a nova página/action.

## 11. Abertos / Fora de Escopo
- Gráficos ou exportação; filtros por período; personalização por usuário; métricas financeiras agregadas.

## Checklist
- [x] Indicadores e escopo de dados definidos
- [x] Lista de orçamentos recentes com ordenação e limite
- [x] Links e atalhos consistentes com o menu existente
- [x] Tratamento de erro sem quebrar a página
- [x] Leitura protegida por sessão autenticada
- [x] Critérios de aceite verificáveis manualmente

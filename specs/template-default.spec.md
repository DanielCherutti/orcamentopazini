# Template de Especificação (SDD)

Use este template para qualquer entrega (arquitetura, funcionalidade, integrações). Substitua os blocos `TODO` por conteúdo concreto e mensurável. Evite termos vagos; prefira formatos, contratos e critérios testáveis.

**IMPORTANTE:** Focar em **comportamento funcional**, **contratos** e **requisitos não funcionais**. Detalhes de implementação (código) só devem aparecer se forem restrições arquiteturais.

## 1. Contexto e Objetivo
- **Contexto:** TODO (ex.: Usuário precisa visualizar dashboard de vendas)
- **Objetivo:** TODO (o que muda para o usuário/negócio)
- **Escopo:** TODO (o que está dentro/fora nesta entrega)

## 2. Requisitos Funcionais
- TODO listar comportamentos observáveis. Ex.: telas, interações, validações, processamentos.
- Para cada requisito, torne-o testável (entrada → saída/efeito).

## 3. Contratos e Interfaces
- **UI/UX:** Rotas (URL), componentes principais, estados de loading/erro, responsividade.
- **Server Actions / API:** assinatura da função, inputs (Zod schema), outputs (sucesso/erro), permissões.
- **Banco de Dados:** modelos/tabelas afetados, queries principais (leitura/escrita).

## 4. Fluxos e Estados
- **Fluxo Feliz:** Passo a passo da interação do usuário.
- **Estados Alternativos:** Erros de validação, erros de servidor, timeouts, estados vazios.
- **Feedback:** Toasts, mensagens de erro inline, redirecionamentos.

## 5. Dados
- Estruturas persistidas: Novas tabelas ou campos no SurrealDB.
- Validação: Regras de negócio para dados (ex.: email único, data futura).

## 6. NFRs (Não Funcionais)
- **Desempenho:** Tempo de carregamento (LCP), tempo de resposta da ação (TTFB).
- **Segurança:** Autenticação (quem pode?), Autorização (o que pode?), Validação de input (Zod).
- **Observabilidade:** Logs de erro, auditoria de ações críticas.

## 7. Guardrails
- **Restrições de Stack:** Usar componentes shadcn/ui existentes, não adicionar libs pesadas sem aprovação.
- **Convenções:** Seguir estrutura `app/`, Server Actions em `actions/`.
- **Padrões:** Tratamento de erros padronizado (`error.tsx`, `toast`).

## 8. Critérios de Aceite
- Lista objetiva de verificações. Ex.: "Ao clicar em Salvar com form válido, redireciona para /listagem".
- Validar também casos de erro (ex.: "Ao submeter vazio, mostra erro no campo X").

## 9. Testes
- **E2E:** Cenários principais (Playwright).
- **Integração:** Testes de Server Actions (se aplicável).
- **Manual:** Passos para validação visual/interativa.

## 10. Migração / Rollback
- Scripts de migração de banco (se houver alteração de esquema).
- Plano de rollback (ex.: reverter commit e rodar script de down).

## 11. Abertos / Fora de Escopo
- Itens não cobertos nesta entrega.

## Checklist Rápido
- [ ] Requisitos funcionais claros e testáveis?
- [ ] Interfaces (UI e Dados) definidas?
- [ ] Fluxos de erro cobertos?
- [ ] Guardrails de segurança e performance verificados?
- [ ] Critérios de aceite cobrem happy path e edge cases?

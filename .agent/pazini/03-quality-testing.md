# Qualidade, Testes e Refatoração

## Testes e critérios de aceite
- Gerar/rodar testes previstos em cada spec
- Validar critérios de aceite antes de concluir
- **Estratégia:**
  - Testes unitários: isolar com mocks
  - Testes de integração: testcontainers/fixtures
  - Testes E2E: apenas fluxos críticos
  - Testes de performance: quando há requisitos
- **Cobertura:**
  - Mínimo 80% para código novo
  - Manter cobertura ao refatorar

## Padrões de qualidade
- **Complexidade e tamanho:**
  - Complexidade ciclomática: < 15
  - Tamanho de arquivos: < 300 linhas (considerar divisão se > 500)
  - Tamanho de funções: < 50 linhas (considerar divisão se > 100)
- **Code Review:**
  - Testes passando
  - Checklist da spec marcado
  - Código formatado
  - README atualizado

## Refatoração
- **Antes de refatorar:**
  - Verificar spec relacionada
  - Se alterar comportamento: criar/atualizar spec primeiro
  - Se melhoria técnica: documentar em ADR
- **Código legado:**
  - Criar spec retroativamente antes de modificar
- **Refatoração incremental:**
  - Pequenas e incrementais
  - Manter compatibilidade
  - Testes devem passar antes e depois

## Tratamento de Erros
- Erros tipados quando possível
- Mensagens acionáveis com contexto
- Não usar panic (exceto erros de programação)
- Adicionar contexto ao propagar
- Logar apenas na camada mais externa
- **Segurança de Produção**: O sistema está em produção. Mudanças não devem interromper o fluxo de trabalho. Exclusão de dados ou recursos legados requer aprovação explícita e documentada do usuário.

# Arquitetura e Evolução

## Architecture Decision Records (ADRs)
- **Quando criar:**
  - Decisões arquiteturais significativas
  - Escolha de bibliotecas/frameworks
  - Mudanças em padrões estabelecidos
  - Decisões que podem ser questionadas
- **Formato:**
  - Localização: `docs/adr/` ou `specs/adr/`
  - Numeração: `ADR-001-decisao.md`
  - Estrutura: Contexto, Decisão, Consequências, Alternativas
- **Integração:** ADRs podem referenciar specs e vice-versa

## Performance e Otimização
- **Otimização prematura:** não otimizar sem métricas
- **Quando otimizar:**
  - Performance abaixo das metas
  - Problemas em produção
  - Refatoração que melhora legibilidade E performance
- **Profiling:** usar ferramentas, documentar resultados

## Deprecação de Features
1. Atualizar spec marcando como deprecated
2. Adicionar aviso no código/CLI
3. Documentar alternativa
4. Manter compatibilidade por 2 versões MAJOR
5. Remover em nova versão MAJOR

## Breaking Changes
1. Criar spec documentando mudança
2. Planejar migração
3. Comunicar em changelog
4. Incrementar versão MAJOR
5. Fornecer guia de migração

## Escalabilidade
- **Quando cresce:**
  - > 10 serviços: subdiretórios por domínio
  - Arquivo > 500 linhas: dividir
  - Comando > 300 linhas: extrair lógica
- **Organização por domínio:** `internal/{domain}/`
- Evitar circular dependencies

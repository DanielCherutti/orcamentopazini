# Regras do Projeto Pazini

Este diretório contém as regras específicas do projeto Pazini, organizadas por tema.

## 📋 Arquivos de Regras

### Core e Fundamentos
1. **[01-sdd-core.md](./01-sdd-core.md)** - Spec Driven Development
   - Linguagem e comunicação (pt-BR)
   - Fluxo SDD e consulta de specs
   - Abstração de detalhes de implementação
   - Estrutura de diretórios

### Controle de Versão
2. **[02-git-versioning.md](./02-git-versioning.md)** - Git e Versionamento
   - Gitflow (main, develop, feature, release, hotfix)
   - Conventional Commits
   - Gerenciamento de branches
   - Versionamento semântico

### Qualidade de Código
3. **[03-quality-testing.md](./03-quality-testing.md)** - Qualidade e Testes
   - Estratégia de testes (unitários, integração, E2E)
   - Padrões de qualidade (complexidade, tamanho)
   - Refatoração incremental
   - Tratamento de erros

### Segurança e Dependências
4. **[04-dependencies-security.md](./04-dependencies-security.md)** - Dependências e Segurança
   - Guardrails de dependências
   - Segurança (tokens, configs)
   - Compatibilidade (SO, paths)

### Documentação
5. **[05-documentation-ux.md](./05-documentation-ux.md)** - Documentação e UX
   - README centralizado
   - Documentação de código
   - UX de CLI
   - Observabilidade e logs

### Arquitetura
6. **[06-architecture-evolution.md](./06-architecture-evolution.md)** - Arquitetura e Evolução
   - Architecture Decision Records (ADRs)
   - Performance e otimização
   - Deprecação de features
   - Breaking changes
   - Escalabilidade

### Processos
7. **[07-checklist-management.md](./07-checklist-management.md)** - Gerenciamento de Checklist
   - Marcação de itens ao implementar
   - Formato padronizado
   - Validação de status

---

## 🎯 Como Usar

Todas as regras neste diretório são aplicadas automaticamente pelo Antigravity quando você trabalha no projeto Pazini.

### Referência Rápida

**Antes de implementar qualquer feature:**
1. ✅ Consultar specs em `specs/`
2. ✅ Verificar checklist da spec
3. ✅ Criar/atualizar spec se necessário
4. ✅ Aguardar aprovação do usuário
5. ✅ Implementar conforme spec

**Ao fazer commit:**
- Use Conventional Commits: `tipo(escopo): descrição`
- Exemplos: `feat(products): adiciona paginação`, `fix(auth): corrige validação`

**Ao criar branch:**
- Formato: `feature/{numero}-{nome}`
- Exemplo: `feature/02-product-management`

---

## 📚 Documentação Relacionada

- **Specs**: `/specs/` - Especificações técnicas do projeto
- **README**: `/README.md` - Documentação principal do projeto
- **ADRs**: `/specs/adr/` - Architecture Decision Records (quando aplicável)

---

## 🔄 Atualização das Regras

Estas regras são derivadas do `.cursorrules` original e foram organizadas para melhor navegação e manutenção. Qualquer atualização deve ser feita nos arquivos individuais e sincronizada com o `.cursorrules` se necessário.

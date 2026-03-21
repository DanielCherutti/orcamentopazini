---
trigger: always_on
---

# PAZINI.md - Regras do Projeto Pazini

> Este arquivo carrega as regras específicas do projeto Pazini localizadas em `.agent/pazini/`.

---

## 🎯 Regras Ativas

As seguintes regras estão ativas para este projeto:

### 📚 Referência Completa
Para detalhes completos, consulte os arquivos em `.agent/pazini/`:

1. **[01-sdd-core.md](../pazini/01-sdd-core.md)** - Spec Driven Development
2. **[02-git-versioning.md](../pazini/02-git-versioning.md)** - Git e Versionamento  
3. **[03-quality-testing.md](../pazini/03-quality-testing.md)** - Qualidade e Testes
4. **[04-dependencies-security.md](../pazini/04-dependencies-security.md)** - Dependências e Segurança
5. **[05-documentation-ux.md](../pazini/05-documentation-ux.md)** - Documentação e UX
6. **[06-architecture-evolution.md](../pazini/06-architecture-evolution.md)** - Arquitetura e Evolução
7. **[07-checklist-management.md](../pazini/07-checklist-management.md)** - Gerenciamento de Checklist
8. **[08-surrealdb-patterns.md](../pazini/08-surrealdb-patterns.md)** - Padrões SurrealDB (IDs, queries, serialização)

---

## 🔑 Regras Principais (Resumo)

### Spec Driven Development (SDD)
- **SEMPRE** consultar specs em `specs/` antes de implementar
- **NUNCA** implementar sem spec validada (exceto bugs críticos)
- Aguardar aprovação do usuário antes de criar/modificar specs
- Responder sempre em **português (pt-BR)**

### Git e Commits
- **Gitflow**: `main`, `develop`, `feature/{numero}-{nome}`, `release/{versao}`, `hotfix/{descricao}`
- **Conventional Commits**: `tipo(escopo): descrição` em português
- **Nunca** commitar specs automaticamente (só quando usuário pedir)
- Criar branch `feature/{numero}-{nome}` ao iniciar implementação de spec

### Qualidade
- **Testes**: mínimo 80% cobertura para código novo
- **Complexidade**: funções < 15, arquivos < 300 linhas
- **Refatoração**: incremental, testes devem passar antes e depois
- **Erros**: tipados, mensagens acionáveis com contexto

### Dependências
- **Evitar** adicionar novas dependências
- Se inevitável: criar ADR justificando
- **Fixar** versões major (`v1.2.3` não `^v1.2.3`)
- Verificar vulnerabilidades antes de adicionar

### Documentação
- **Centralizar** em `README.md` na raiz
- **Nunca** criar arquivos separados (exceto se solicitado)
- Atualizar README ao finalizar entregas
- Funções públicas: sempre documentar

### Checklist de Specs
- Marcar automaticamente após implementar e validar
- Formato: `- [ ]` pendente, `- [x]` concluído
- Spec completa = seções obrigatórias + checklist todo marcado

---

## 📂 Estrutura do Projeto

```
pazini/
├── specs/              # Especificações técnicas (fonte da verdade)
│   ├── 00-*.spec.md   # Specs base (arquitetura, stack)
│   └── {YYYYMMDDhhmmss}-*.spec.md  # Specs de funcionalidades (ex: 20260319153000-feature.md)
├── front/             # Frontend Next.js
├── .agent/            # Configuração Antigravity
│   ├── pazini/        # Regras específicas do projeto
│   └── rules/         # Regras globais (GEMINI.md, PAZINI.md)
└── README.md          # Documentação principal
```

---

## 🚀 Fluxo de Trabalho

### Implementar Nova Feature
1. Usuário solicita feature
2. Consultar `specs/` para verificar se já existe spec
3. Se não existe: propor criação de spec e aguardar aprovação
4. Se existe: verificar checklist
5. Criar branch `feature/{numero}-{nome}`
6. Implementar conforme spec
7. Marcar checklist ao concluir
8. Commit com Conventional Commits
9. Merge para `develop` quando pronto

### Fazer Commit
1. Usuário digita "commit"
2. Gerar mensagem Conventional Commits em português
3. Incluir specs no commit (se usuário pediu explicitamente)
4. Aplicar na branch atual

---

## ⚠️ Regras Críticas

### ❌ NUNCA
- Implementar código sem spec validada
- Commitar specs automaticamente
- Criar arquivos de documentação separados
- Adicionar dependências sem justificativa (ADR)
- Incluir detalhes de implementação nas specs de funcionalidades
- **Apagar dados ou recursos (incluindo código legado)** sem aprovação explícita e documentada do usuário
- Quebrar funcionalidades existentes ou interromper o fluxo de produção sem plano de contingência aprovado

### ✅ SEMPRE
- Responder em português (pt-BR)
- Consultar specs antes de implementar
- Aguardar aprovação do usuário
- Usar Conventional Commits
- Marcar checklist ao concluir implementação
- Atualizar README ao finalizar entregas
- Usar `new StringRecordId(...)` ao passar IDs em queries SurrealDB (nunca string pura)
- Normalizar IDs recebidos com `decodeURIComponent` + prefixo da tabela antes de usar
- **Priorizar a integridade do ambiente de produção** em todas as decisões de código e infraestrutura

---

## 📖 Leitura Recomendada

Ao trabalhar no projeto Pazini, consulte:
1. `.agent/pazini/README.md` - Índice completo das regras
2. `specs/00-architecture.spec.md` - Arquitetura do projeto
3. `specs/00-stack.spec.md` - Stack técnica
4. `README.md` - Documentação do projeto

---

**Última atualização**: 2026-03-19 (Regras de Produção e Timestamps)

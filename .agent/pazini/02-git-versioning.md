# Git, Branches e Versionamento

## Gitflow - Estratégia de Branching
- **O projeto utiliza Gitflow:**
  - `main`: branch de produção (código estável e testado)
  - `develop`: branch de desenvolvimento (integração contínua)
  - `feature/{numero}-{nome}`: branches para novas funcionalidades
  - `release/{versao}`: branches para preparação de releases
  - `hotfix/{descricao}`: branches para correções urgentes em produção

## Conventional Commits
- **Formato:** `<tipo>(<escopo>): <descrição>`
- **Tipos permitidos:**
  - `feat`: Nova funcionalidade (incrementa versão MINOR)
  - `fix`: Correção de bug (incrementa versão PATCH)
  - `docs`: Mudanças em documentação
  - `style`: Formatação (não altera código)
  - `refactor`: Refatoração de código
  - `perf`: Melhoria de performance
  - `test`: Adição ou correção de testes
  - `chore`: Mudanças em build, dependências
  - `ci`: Mudanças em CI/CD
  - `build`: Mudanças em sistema de build
- **Descrição:** curta, em português, no imperativo
- **Exemplos:** `feat(init): adiciona comando init básico`

## Commits automatizados
- Quando o usuário digitar "commit", gerar commit seguindo **Conventional Commits**.
- **NUNCA commitar automaticamente arquivos em `specs/`** após criar ou modificar.
- Se o usuário solicitar commit explicitamente, incluir specs normalmente.

## Gerenciamento de branches para specs
- **Ao iniciar implementação:**
  - Criar branch `feature/{numero}-{nome}` (ex.: `feature/02-init`)
  - Fazer checkout para a nova branch
  - Informar ao usuário
- **Ao mudar de spec:**
  - **PERGUNTAR** se deseja fazer merge para `develop` antes de mudar
  - Informar sobre mudança de branch

## Versionamento e Build
- **Incremento automático:** PATCH (0.0.1 → 0.0.2)
- **Tags Git:** `v{MAJOR}.{MINOR}.{PATCH}`
- **CI/CD:** GitHub Actions acionado automaticamente

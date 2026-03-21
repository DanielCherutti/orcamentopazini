# 00 - Especificação de Contexto Global

Esta especificação define o contexto global do projeto: visão, objetivos, escopo, requisitos não funcionais, estratégias de distribuição, configuração, integrações e testes. Use-a como referência para entender o projeto como um todo antes de implementar features específicas.

## 1. Visão e Objetivos

**Nota sobre repositório:** O código-fonte do sistema está em repositório Git separado (pasta `front/`). Este repositório contém apenas as especificações (specs) e documentação do projeto.

### 1.1 Propósito do Projeto
- **Aplicação Web Multitenant**: Sistema completo de gestão de orçamentos para equipamentos de segurança industrial com arquitetura multitenant, onde cada tenant (organização cliente) possui seus próprios dados isolados.
- **Gestão de Orçamentos**: Permite criar, editar e gerenciar orçamentos de adequação de segurança, integrando produtos do catálogo, empresas clientes e locais de instalação.
- **Propostas Comerciais**: Gera propostas comerciais profissionais em formato DOCX seguindo template padronizado.
- **Inspiração/Referência**: Sistemas SaaS multitenant modernos com isolamento de dados por tenant, controle de acesso baseado em roles (RBAC), e auditoria completa.

### 1.2 Usuário-alvo
- **Usuários Master (Super Admin)**: Administradores do sistema que gerenciam todos os tenants, criam organizações e usuários de qualquer perfil.
- **Admins de Tenant**: Administradores de organizações específicas que gerenciam seus próprios tenants, produtos, orçamentos e usuários normais.
- **Usuários Normais**: Operadores do sistema que criam e gerenciam orçamentos dentro de seu tenant.
- **Casos de uso primários**: 
  - Criação e gestão de orçamentos de equipamentos de segurança
  - Gerenciamento de catálogo de produtos
  - Cadastro de empresas clientes
  - Geração de propostas comerciais profissionais
  - Auditoria e rastreamento de todas as ações

### 1.3 Resultados Esperados
- **Onboarding**: Master pode criar primeiro tenant e começar a usar o sistema em < 5 minutos após instalação
- **Latência de operações**: Resposta de APIs < 200ms para operações CRUD básicas
- **Isolamento garantido**: Dados de um tenant nunca acessíveis por outro tenant
- **Auditoria completa**: 100% das ações registradas em audit_log
- **Métricas de sucesso**: 
  - Taxa de erro < 1% em operações normais
  - Tempo de carregamento de páginas < 2s
  - Disponibilidade > 99.5%
  - Satisfação do usuário medida por feedback

## 2. Escopo

### 2.1 Escopo Inicial (v1)
- **Autenticação e Autorização Multitenant**: Sistema completo de login, JWT, controle de acesso por roles (Master, Admin, User)
- **Gestão de Tenants**: CRUD completo de organizações (tenants) com soft delete
- **Gestão de Usuários**: Criação, edição, remoção de usuários com validação de permissões por role
- **Gestão de Produtos**: CRUD completo de produtos com upload de imagens e processamento
- **Gestão de Clientes**: CRUD completo de empresas/clientes com validação de CNPJ e telefone
- **Gestão de Orçamentos**: CRUD completo de orçamentos com múltiplas áreas/localizações, cálculo automático de valores
- **Proposta Comercial**: Geração de documentos DOCX seguindo template padronizado
- **Audit Logs**: Sistema completo de logging de todas as ações com filtros e busca
- **Dashboard**: Visualização de métricas e resumo do sistema
- **Seleção de Tenant**: Alternância entre tenants para usuários com múltiplos acessos

### 2.2 Fora de Escopo (v1)
- **OAuth/SSO**: Autenticação via provedores externos (Google, Microsoft, etc.)
- **RBAC Granular**: Sistema de permissões granulares por recurso/ação (estrutura preparada, mas não implementada)
- **API Pública**: API REST pública para integração externa
- **Mobile App**: Aplicativo mobile nativo (apenas web responsivo)
- **Notificações Push**: Notificações em tempo real via WebSocket
- **Integração com ERPs**: Integração direta com sistemas ERP externos
- **Multi-idioma**: Suporte a múltiplos idiomas (apenas português BR)
- **Temas Customizáveis**: Personalização de cores/temas por tenant
- **Justificativa**: Complexidade, priorização de features core, dependências externas, escopo inicial focado em funcionalidades essenciais

### 2.3 Roadmap Futuro
- **v2**: 
  - RBAC granular completo (permissões por recurso/ação)
  - API REST pública com autenticação via API keys
  - Integração com sistemas externos (webhooks)
- **v3**: 
  - OAuth/SSO
  - Notificações em tempo real
  - Dashboard avançado com gráficos e relatórios
- **v4**: 
  - Mobile app nativo
  - Multi-idioma
  - Temas customizáveis por tenant

## 3. Requisitos Não Funcionais Globais

### 3.1 Desempenho
- **Latência**: 
  - Operações CRUD básicas: < 200ms
  - Carregamento de páginas: < 2s
  - Upload de imagens: < 5s para imagens até 5MB
  - Geração de proposta DOCX: < 10s
- **Throughput**: 
  - Suportar 100 requisições/minuto por tenant (rate limiting)
  - Suportar 50 usuários simultâneos por tenant
- **Timeouts**: 
  - Requisições HTTP: 30s
  - Operações de banco de dados: 10s
  - Upload de arquivos: 60s

### 3.2 Robustez
- **Idempotência**: Operações de criação/atualização devem ser idempotentes quando possível (ex.: criar tenant com mesmo documento retorna existente)
- **Retries**: Backoff exponencial para operações de rede (1s, 2s, 4s, máximo 3 tentativas)
- **Tolerância a falhas**: 
  - Degradação graciosa: sistema continua funcionando mesmo com algumas funcionalidades indisponíveis
  - Fallback para cache quando possível
  - Mensagens de erro claras e acionáveis

### 3.3 Observabilidade
- **Logs**: 
  - Níveis: ERROR, WARN, INFO, DEBUG
  - Formato estruturado (JSON em modo debug)
  - Request-id para correlação
  - Contexto: comando, operação, caminhos (sem dados sensíveis)
- **Métricas**: 
  - Latência de requisições
  - Taxa de erro por endpoint
  - Throughput por tenant
  - Uso de recursos (CPU, memória)
- **Rastreamento**: 
  - Correlation IDs (request-id)
  - Session IDs para rastreamento de usuário
  - Audit logs com contexto completo

### 3.4 Portabilidade
- **Plataformas**: 
  - Navegadores modernos (Chrome, Firefox, Safari, Edge - últimas 2 versões)
  - Responsivo para mobile (iOS Safari, Chrome Mobile)
- **Arquiteturas**: 
  - x64 (servidor)
  - arm64 (servidor, se aplicável)
- **Dependências**: 
  - Runtime: Node.js/Bun no servidor
  - Navegador: JavaScript ES2020+
  - Sem dependências nativas obrigatórias no frontend

### 3.5 Segurança
- **Autenticação**: 
  - JWT tokens com expiração (7 dias para refresh token, 1 hora para access token)
  - Senhas hasheadas com bcrypt (salt rounds: 10)
  - Validação de email e senha forte
- **Autorização**: 
  - RBAC baseado em roles (Master, Admin, User)
  - Validação de permissões no backend (nunca confiar apenas no frontend)
  - Isolamento de dados por tenant garantido
- **Armazenamento seguro**: 
  - Senhas nunca armazenadas em texto plano
  - Tokens JWT com secret seguro
  - Dados sensíveis sanitizados em logs
- **Transporte**: 
  - HTTPS obrigatório em produção
  - TLS 1.2 mínimo
  - Headers de segurança (CORS, CSP)

### 3.6 Recuperação
- **Backup**: 
  - Backup manual por tenant (apenas Master)
  - Formato: exportação completa dos dados do tenant em JSON
  - Frequência: sob demanda
- **Rollback**: 
  - Restore de backup por tenant (apenas Master)
  - Validação de integridade antes de restore
  - Suporte a overwrite de dados existentes
- **Integridade**: 
  - Validação de dados antes de persistir
  - Constraints no banco de dados
  - Checksums para uploads de arquivos

## 4. Distribuição e Instalação

### 4.1 Estratégia de Distribuição
- **Formato**: 
  - Build estático (HTML/CSS/JS) servido via servidor HTTP
  - Servidor Node.js/Bun para API e gateway SurrealDB
  - Docker container para produção (opcional)
- **Canais**: 
  - GitHub Releases (artefatos de build)
  - Deploy via SSH para servidor próprio
  - Docker Hub (se usar containers)
- **Instalador**: 
  - Script de deploy (`deploy.sh`) que faz build e copia para servidor (no repositório do frontend)
  - Instalação manual (no repositório do frontend): `bun install && bun run build && bun run server`

### 4.2 Verificações Pós-Instalação
- Verificar se SurrealDB está rodando e acessível
- Verificar se variáveis de ambiente estão configuradas
- Verificar se banco de dados foi inicializado (namespace e DB criados)
- Verificar se usuário Master foi criado
- Testar login com credenciais Master
- Verificar se portas estão disponíveis (3000 para servidor, 5173 para dev)

### 4.3 Desinstalação
- Remover arquivos do diretório de deploy
- Parar servidor e processos relacionados
- Remover containers Docker (se aplicável)
- Manter banco de dados (dados preservados para possível reinstalação)
- Remover configurações do Nginx (se aplicável)

## 5. Auto-Update (se aplicável)

### 5.1 Fonte de Versões
- **GitHub Releases**: Versões disponíveis via tags Git
- **Canais**: 
  - `stable`: Versões estáveis (tags `v*.*.*`)
  - `latest`: Última versão disponível

### 5.2 Estratégia
- **Manual**: Atualização via script de deploy (`deploy.sh`)
- **Processo**: 
  1. Fazer pull da branch main/develop
  2. Executar `bun install` para atualizar dependências
  3. Executar `bun run build` para gerar novo build
  4. Copiar arquivos para servidor
  5. Reiniciar servidor
- **Validação**: 
  - Testes E2E após atualização
  - Verificação de integridade do banco de dados
  - Rollback automático em caso de falha crítica
- **Rollback**: 
  - Manter build anterior como backup
  - Restaurar build anterior em caso de falha
  - Restaurar banco de dados de backup se necessário

### 5.3 Segurança
- **Checksums**: SHA256 para artefatos de build (futuro)
- **HTTPS**: Todas as comunicações via HTTPS
- **Assinatura**: Verificação de integridade de releases (futuro)

## 6. Configuração, Estado e Cache

### 6.1 Arquivos e Localização
- **Config**: 
  - Arquivo `front/.env` ou `front/.env.local` (variáveis de ambiente do frontend)
  - Não versionado (usar `front/.env.example` como template)
- **Estado**: 
  - Banco de dados SurrealDB (dados persistentes)
  - Sessões de usuário em memória (JWT tokens)
- **Cache**: 
  - React Query cache em memória (TTL configurável por query)
  - Cache de imagens no navegador
- **Lock files**: 
  - `bun.lockb` para dependências
  - Lock de operações concorrentes no banco (SurrealDB gerencia)

### 6.2 Formato
- **Formato de configuração**: Variáveis de ambiente (`front/.env` ou `front/.env.local`)
- **Schema**: 
  - Validação via código TypeScript
  - Valores obrigatórios: `VITE_SURREALDB_*`, `JWT_SECRET`
  - Valores opcionais: `APP_MASTER_*`, `PORT`, etc.

### 6.3 Campos Sensíveis
- **Proteção**: 
  - `JWT_SECRET`: Nunca versionado, obrigatório em produção
  - Senhas de usuários: Hasheadas com bcrypt, nunca em texto plano
  - Tokens JWT: Armazenados em localStorage (risco aceito para MVP)
- **Rotação**: 
  - JWT_SECRET pode ser rotacionado (requer re-login de todos os usuários)
  - Senhas podem ser resetadas por admin

### 6.4 Cache
- **Estratégia de cache**: 
  - React Query: `staleTime` de 5 minutos para dados de negócio
  - `staleTime` de 2 minutos para buscas
  - Invalidação automática após mutações
  - Cache de imagens: Headers HTTP `Cache-Control` (1 hora)

## 7. Integrações Externas

### 7.1 APIs Externas
- **Base URL**: Não há APIs externas no momento (sistema self-contained)
- **Autenticação**: N/A
- **Timeouts**: N/A
- **Versão de API**: N/A

### 7.2 Proxies/Corporate
- **Suporte a proxies**: 
  - Variáveis de ambiente padrão: `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`
  - Suporte via configuração do runtime (Bun/Node.js)

### 7.3 Outras Integrações
- **SurrealDB**: 
  - Banco de dados principal
  - Conexão via `surrealdb.js` client
  - Configuração via variáveis de ambiente
  - Timeout: 10s para operações
  - **Banco único**: Sempre usa banco `core` em todos os ambientes (dev, test, production)
  - **Decisão arquitetural**: Uso de banco único garante consistência e simplifica configuração
  - **Namespace**: Configurável via `VITE_SURREALDB_NS` (padrão: `pazini`)
- **Processamento de Imagens**: 
  - Biblioteca Sharp (nativa, requer instalação)
  - Processamento local (não há serviço externo)

## 8. Estratégia de Testes

### 8.1 Tipos de Testes
- **Unidade**: 
  - Testes de funções utilitárias
  - Testes de serviços com mocks
  - Cobertura alvo: 80% (futuro)
- **Integração**: 
  - Testes de handlers com SurrealDB real (banco `core`)
  - Testes de fluxos completos (criação de tenant, usuário, etc.)
  - Isolamento via limpeza de dados antes/depois dos testes no mesmo banco `core`
- **E2E**: 
  - Testes completos com Playwright
  - Cobertura de fluxos críticos (login, CRUD, isolamento)
  - Ambiente isolado via limpeza de dados no banco `core` antes/depois dos testes
- **Contratos**: 
  - Validação de tipos TypeScript
  - Schemas Zod para validação de dados

### 8.2 Ferramentas
- **Framework de testes**: Playwright para E2E
- **Mocks**: Mocks manuais para serviços externos
- **Fixtures**: Helpers reutilizáveis em `tests/helpers/`
- **Setup/Teardown**: Scripts em `tests/setup/` para preparar/limpar ambiente

### 8.3 Git Hooks (se aplicável)
- **Pre-commit**: Executar lint (`bun run lint`)
- **Pre-push**: Executar testes E2E (futuro, opcional)
- **Configuração**: Via scripts ou ferramentas como Husky (futuro)

## 9. Convenções e Guardrails Globais

### 9.1 Mensagens e Comunicação
- **Padrão de mensagens**: 
  - Curtas e acionáveis
  - Em português (pt-BR)
  - Contexto claro (o que aconteceu, o que fazer)
- **Output**: 
  - Mensagens de erro claras e específicas
  - Feedback visual para ações do usuário (toasts, notificações)
  - Help sempre disponível (tooltips, documentação inline)
- **Códigos de saída**: 
  - HTTP: 200 sucesso, 400 bad request, 401 unauthorized, 403 forbidden, 404 not found, 500 server error
  - Aplicação: Códigos de status em respostas JSON

### 9.2 Logs
- **Padrão de logging**: 
  - Níveis: ERROR, WARN, INFO, DEBUG
  - Formato estruturado em modo debug (JSON)
  - stdout para output normal, stderr para erros
- **Nunca logar**: 
  - Senhas (mesmo hasheadas)
  - Tokens JWT completos
  - Dados sensíveis de clientes (CPF, CNPJ completo em alguns contextos)
  - Informações de autenticação

### 9.3 Dependências
- **Política de dependências**: 
  - Preferir bibliotecas padrão quando possível
  - Justificar cada nova dependência externa
  - Evitar dependências pesadas (> 1MB)
  - Versionamento fixo (sem `^` ou `~`)
  - Atualizar dependências regularmente (security patches)

### 9.4 Segurança
- **Guardrails de segurança**: 
  - Nunca logar segredos, tokens ou senhas
  - Validação de inputs no backend (nunca confiar apenas no frontend)
  - Sanitização de dados em logs
  - Isolamento de dados por tenant garantido
  - Rate limiting por tenant (100 req/min)

## 10. Riscos e Decisões em Aberto

### 10.1 Riscos Identificados
- **Dependência de Sharp**: Biblioteca nativa que requer instalação, pode causar problemas em alguns ambientes
- **JWT em localStorage**: Risco de XSS, considerar httpOnly cookies no futuro
- **Isolamento por tenantId**: Depende de validação correta em todas as queries, risco de vazamento de dados se implementação incorreta
- **Escalabilidade**: Banco único pode se tornar gargalo com muitos tenants, considerar sharding no futuro
- **Backup manual**: Sem backup automático, risco de perda de dados

### 10.2 Decisões em Aberto
- **Telemetria**: Coletar métricas de uso? (privacidade vs. melhorias)
- **Feature flags**: Sistema de feature flags para releases graduais?
- **Multi-região**: Suporte a múltiplas regiões/DCs?
- **CDN**: Usar CDN para assets estáticos?
- **Monitoring**: Ferramenta de monitoring (Prometheus, Datadog, etc.)?

## 11. Referências a Outras Specs

### 11.1 Arquitetura
- **Referência:** Detalhes de padrão arquitetural, estrutura de diretórios e isolamento estão em `00-architecture.spec.md`.

### 11.2 Stack Técnica
- **Referência:** Detalhes de linguagem, ferramentas, build e empacotamento estão em `00-stack.spec.md`.

## Critérios de Aceite (Contexto Global)

- [x] Visão e objetivos definidos e claros
- [x] Escopo inicial e fora de escopo explicitamente listados
- [x] Requisitos não funcionais globais mensuráveis e testáveis
- [x] Estratégia de distribuição e instalação definida
- [x] Estratégia de configuração, estado e cache definida
- [x] Integrações externas documentadas
- [x] Estratégia de testes por camada definida
- [x] Convenções e guardrails globais estabelecidos
- [x] Riscos e decisões em aberto identificados

## Checklist Rápido (preencha antes de gerar código)

- [x] Visão e objetivos estão claros e mensuráveis?
- [x] Escopo inicial e fora de escopo estão explicitamente definidos?
- [x] Requisitos não funcionais são testáveis e mensuráveis?
- [x] Estratégias de distribuição, configuração e integração estão definidas?
- [x] Convenções e guardrails globais estão escritos?
- [x] Riscos e decisões em aberto estão identificados?

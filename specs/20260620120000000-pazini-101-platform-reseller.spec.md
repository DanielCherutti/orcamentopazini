# PAZINI-101 — Painel de revenda (Platform Admin)

**Branch sugerida:** `PAZINI-101` (continuação de `PAZINI-100`)  
**Referências:** `20260601120000000-pazini-100-multi-tenant.spec.md`, `20260127231000000-auth-basic.spec.md`, `00-global-context.spec.md`

## 1. Contexto e objetivo

### 1.1 Contexto

A **PAZINI-100** entregou multi-tenant operacional: isolamento por `tenant_id`, sessão com tenant ativo, seletor de organização e CRUD básico de tenants.

Durante a implementação, o modelo de **Master** foi **refatorado**:

| Modelo antigo (PAZINI-100 spec) | Modelo atual (código) |
|--------------------------------|------------------------|
| `role: master` em `portal_user_tenant` | `portal_user.is_platform_master = true` |
| Master opera dentro de qualquer tenant | Admin da plataforma **não** pertence a orgs clientes |
| CRUD em `/settings/tenants` | Portal dedicado em `/platform` |
| Pazini como “tenant sistema” | **Pazini é org cliente** (`tenant:pazini`) como qualquer outra |

O painel `/platform` já existe parcialmente (dashboard, orgs, planos/preços, branding por org). Faltam **regras de negócio aplicadas** (enforcement) e **operacionalização** para revenda SaaS em produção.

### 1.2 Objetivo

Completar o **painel de gerenciamento / revenda** para que o operador da plataforma consiga:

1. Criar e administrar **empresas clientes** (orgs) sem acessar dados operacionais delas.
2. Configurar **planos, preços e licenças** com efeito real no acesso.
3. Monitorar **receita estimada, uso e alertas** com ações claras.
4. Gerenciar **admins da plataforma** sem scripts manuais.

### 1.3 Escopo

**Dentro desta spec (PAZINI-101):**

- Enforcement de licença (org inativa, licença vencida, limite de usuários).
- Melhorias operacionais no `/platform` (reativar org, filtros, usuários por org, métricas).
- Gestão de admins da plataforma (`is_platform_master`).
- Atualização documental da PAZINI-100 (modelo de roles).
- Testes automatizados mínimos do painel e do enforcement.

**Fora (fases futuras — PAZINI-102+):**

- Gateway de pagamento (Asaas, Stripe, boleto).
- E-mail transacional de vencimento de licença.
- Backup/export por tenant.
- Audit log completo com UI (exceto audit de impersonate — ver PAZINI-102).
- Sharding / multi-database.

**Especificado em detalhe (PAZINI-102):**

- Impersonate / “entrar como suporte” — `20260620140000000-pazini-102-impersonate-custom-domain.spec.md`
- Subdomínio e domínio customizado por cliente — mesmo documento.

---

## 2. Modelo de domínio (atualizado)

### 2.1 Papéis do sistema

| Papel | Onde vive | Acesso |
|-------|-----------|--------|
| **Admin da plataforma** | `portal_user.is_platform_master = true` | Apenas `/platform` (`platformMode` na sessão) |
| **Admin da org** | `portal_user_tenant.role = admin` | App operacional do tenant ativo |
| **Usuário da org** | `portal_user_tenant.role = user` | App operacional (sem gestão de usuários) |

Regras:

- Admin da plataforma **não** tem `portal_user_tenant` (memberships removidas no promote).
- Papéis `master` em `portal_user_tenant` são **legado** — ignorados no login e removidos gradualmente.
- Pazini (`tenant:pazini`) é org cliente; dados operacionais exigem membership, não `platformMode`.

### 2.2 Entidades

| Tabela / registro | Descrição |
|-------------------|-----------|
| `tenant` | Org cliente: `name`, `slug`, `active`, `deleted_at`, `max_users`, `license_plan`, `license_expires_at` |
| `platform_license_settings:singleton` | Preços e metadados comerciais dos planos (`trial`, `standard`, `professional`) |
| `portal_user.is_platform_master` | Flag booleana — admin SaaS |
| `proposal_settings` | Branding por tenant (1:1 com org) |

### 2.3 Planos comerciais

Definidos em `platform_license_settings` (UI `/platform/licenses`), com defaults em `platform-license.ts`:

| Plano | Uso | Preço ref. (editável) | Usuários sugeridos (editável) |
|-------|-----|------------------------|-------------------------------|
| `trial` | Avaliação | R$ 0 | 3 |
| `standard` | Cliente pagante base | R$ 497 | 10 |
| `professional` | Cliente ampliado | R$ 997 | 30 |

**MRR estimado** = Σ (orgs **ativas** × preço do plano). Trials contam R$ 0.

### 2.4 Sessão JWT v2 (atual)

```typescript
{
  v: 2,
  sub: string,              // email
  tenantId?: string,        // app operacional
  role?: "admin" | "user",  // app operacional
  platformMode?: boolean,   // admin plataforma → /platform
  pending?: boolean,        // seleção de tenant
  exp: number
}
```

---

## 3. Estado atual (baseline — já implementado)

Marcar como referência; **não reimplementar** salvo correções.

### 3.1 Portal `/platform`

| Rota | Status |
|------|--------|
| `/platform` | Dashboard (KPIs, receita por plano, alertas, orgs recentes) |
| `/platform/organizations` | Lista + busca + criar org (dialog) |
| `/platform/organizations/[slug]` | Licença, limites, branding |
| `/platform/licenses` | Editar preços e metadados dos planos |

### 3.2 Segurança e roteamento

- [x] `platformMode` → só rotas `/platform/*`
- [x] Usuário operacional bloqueado em `/platform`
- [x] `(main)/layout` redireciona `platformMode` → `/platform`
- [x] `proxy.ts` valida sessão por contexto
- [x] `resolveTenantRef` — slug ou `tenant:id` na URL

### 3.3 Dados e limites parciais

- [x] `max_users` enforced em convites (`tenantHasUserCapacity`)
- [x] Alertas no dashboard (vencimento, limite usuários, inativa)
- [ ] `license_expires_at` **não** bloqueia login
- [ ] `active: false` **não** bloqueia login de forma centralizada
- [ ] Reativar org na UI

### 3.4 Scripts ops

- [x] `npm run promote-master -- <email>` → `is_platform_master`, remove memberships
- [x] `npm run migrate:multi-tenant`
- [x] `npm run test:tenant-isolation`

---

## 4. Requisitos funcionais (PAZINI-101)

### 4.1 Enforcement de licença e acesso (Fase A — bloqueante)

- **RF-101:** Ao login operacional, validar org ativa (`tenant.active !== false`).
- **RF-102:** Ao login operacional, validar licença não vencida (`license_expires_at` null ou > now).
- **RF-103:** Falha de licença → redirect `/` com erro dedicado (`?error=license_expired` ou `?error=org_inactive`).
- **RF-104:** `assertTenantSession()` e `switchTenantAction()` revalidam org ativa + licença (não só membership).
- **RF-105:** `getUserMembershipsByEmail` exclui orgs inativas ou com licença vencida da lista de seleção.
- **RF-106:** Convites para org inativa ou vencida retornam erro claro ao admin que convida.
- **RF-107:** Limite `max_users` já existente — manter; mensagem referencia `/platform` para ajuste de licença.

Mensagens sugeridas (login):

| Código | Mensagem usuário |
|--------|------------------|
| `org_inactive` | Esta organização está desativada. Contate o suporte da plataforma. |
| `license_expired` | A licença desta organização expirou. Contate o suporte para renovar. |

### 4.2 Gestão de organizações — operação (Fase B)

- **RF-110:** Reativar org inativa (`active: true`) na UI de detalhe e na lista.
- **RF-111:** Filtros na lista: status (ativa/inativa), plano, “vencendo em 30 dias”, “no limite de usuários”.
- **RF-112:** Ordenação: nome, data criação, usuários, vencimento licença.
- **RF-113:** Badge visual consistente: ativa, inativa, trial, vencendo, vencida.
- **RF-114:** Ao desativar org, sessões operacionais existentes invalidadas no próximo request (via revalidação server-side — não exige kill de cookie global).

### 4.3 Usuários e métricas por org (Fase C)

- **RF-120:** No detalhe da org (`/platform/organizations/[slug]`), aba ou seção **Usuários**: listar memberships (email, role, ativo, pending_setup).
- **RF-121:** Métricas read-only por org: total usuários, orçamentos, clientes, última atividade (se disponível).
- **RF-122:** Platform admin **não** pode editar senha nem convidar em nome da org (somente visualização) — convites permanecem com admin da org.
- **RF-123:** Link “Entrar como suporte” **não** incluído nesta fase — ver **PAZINI-102** (`20260620140000000-pazini-102-impersonate-custom-domain.spec.md`).

### 4.4 Admins da plataforma (Fase D)

- **RF-130:** Rota `/platform/admins` — listar usuários com `is_platform_master = true`.
- **RF-131:** Promover e-mail existente a platform admin (set flag, remover todas memberships).
- **RF-132:** Remover flag de platform admin (não permitir remover a si mesmo se for o último admin).
- **RF-133:** Substituir ou complementar `promote-master.ts` — script continua para bootstrap, UI para operação.

### 4.5 Dashboard e alertas (Fase E — refinamento)

- **RF-140:** Alertas clicáveis já existem — adicionar ação rápida “Renovar licença” (modal data) no detalhe.
- **RF-141:** Widget “Licenças vencendo” (próximos 30 dias) com contagem no dashboard.
- **RF-142:** Export CSV: orgs + plano + MRR linha + usuários + vencimento (download server-side).
- **RF-143:** Empty states e loading skeletons nas páginas `/platform/*`.

### 4.6 Trial automático (Fase F — opcional v1.1)

- **RF-150:** Ao criar org com plano `trial`, definir `license_expires_at` default (+14 ou +30 dias, configurável em planos).
- **RF-151:** Job ou check no login: trial expirado → org `active: false` ou banner “upgrade” (decisão D6).

### 4.7 Documentação e spec legado (Fase G)

- **RF-160:** Atualizar `20260601120000000-pazini-100-multi-tenant.spec.md`:
  - Master → Platform Admin (`is_platform_master`).
  - RF-06, RF-10, RF-13, fluxos 5.3, CA-04, D2 obsoletos ou reescritos.
- **RF-161:** README ou seção deploy: fluxo promote-master, primeiro admin plataforma, primeiro admin Pazini.

---

## 5. Contratos técnicos

### 5.1 Novos helpers

| Função | Arquivo | Responsabilidade |
|--------|---------|------------------|
| `assertTenantLicenseValid(tenantId)` | `lib/tenant-license.ts` | active + expires_at |
| `getTenantAccessBlockReason(tenant)` | `lib/tenant-license.ts` | `null` \| `inactive` \| `expired` |
| `listPlatformAdminsAction()` | `platform-admin-actions.ts` | CRUD admins plataforma |
| `listOrgMembersForPlatformAction(slug)` | `platform-actions.ts` | read-only memberships |

### 5.2 Server Actions novas/alteradas

| Action | Fase | Notas |
|--------|------|-------|
| `resolvePostLoginRedirect` | A | Checar licença após resolver membership |
| `switchTenantAction` | A | Checar licença |
| `reactivatePlatformOrganizationAction` | B | `active: true` |
| `listPlatformOrganizationsAction` | B | Query params filtros server-side ou client filter v1 |
| `getPlatformOrganizationMetricsAction` | C | counts budget/client |
| `listPlatformAdminsAction` | D | |
| `promotePlatformAdminAction` | D | |
| `demotePlatformAdminAction` | D | |
| `exportPlatformOrganizationsCsvAction` | E | |

### 5.3 UI — rotas finais `/platform`

| Rota | Fase | Descrição |
|------|------|-----------|
| `/platform` | ✅ | Dashboard |
| `/platform/organizations` | B | + filtros |
| `/platform/organizations/[slug]` | B/C | + reativar, + usuários, + métricas |
| `/platform/licenses` | ✅ | Planos e preços |
| `/platform/admins` | D | Admins da plataforma |

### 5.4 Schema SurrealDB

```sql
-- Já existente / garantir em ensureSchema
DEFINE TABLE IF NOT EXISTS platform_license_settings SCHEMALESS;

-- Campos em tenant (já em uso)
-- max_users, license_plan, license_expires_at, active, deleted_at

-- portal_user
-- is_platform_master: bool (garantir campo via migração leve se ausente)
```

Script sugerido: `scripts/ensure-platform-schema.ts` ou extensão de `run-migration-multi-tenant.ts`.

---

## 6. Fluxos

### 6.1 Login — admin da plataforma

1. Email/senha OK.
2. `isPlatformMasterEmail` → true.
3. Sessão `platformMode: true` (sem tenantId).
4. Redirect `/platform`.
5. Tentativa de acessar `/dashboard` → redirect `/platform`.

### 6.2 Login — usuário Pazini (org cliente)

1. Email/senha OK.
2. Não é platform master.
3. Memberships em `tenant:pazini` (e/ou outras).
4. Resolve tenant + valida licença org.
5. Redirect `/dashboard` ou `/select-tenant`.

### 6.3 Licença vencida

1. Usuário com membership válida tenta login.
2. Org tem `license_expires_at` no passado.
3. Login recusado com `?error=license_expired`.
4. Platform admin renova data em `/platform/organizations/pazini` → usuários voltam a entrar.

### 6.4 Promover admin plataforma (UI)

1. Platform admin acessa `/platform/admins`.
2. Informa e-mail existente → Promover.
3. Sistema: `is_platform_master = true`, DELETE `portal_user_tenant` do usuário.
4. Usuário no próximo login vai para `/platform`.

---

## 7. Plano de implementação

### Fase A — Enforcement (bloqueante produção)

- [ ] `lib/tenant-license.ts` — validação central
- [ ] Integrar em `resolvePostLoginRedirect`, `switchTenantAction`, `getUserMembershipsByEmail`
- [ ] Integrar em `assertTenantSession`
- [ ] Página login — alerts `org_inactive`, `license_expired`
- [ ] Testes: `scripts/platform-license-enforcement-regression.ts`

**Estimativa:** 1 PR focado.

### Fase B — Operação de orgs

- [ ] `reactivatePlatformOrganizationAction`
- [ ] UI reativar (lista + detalhe)
- [ ] Filtros e ordenação na lista de orgs
- [ ] Badges de status licença

**Estimativa:** 1 PR.

### Fase C — Visibilidade por org

- [ ] Métricas read-only no detalhe (users, budgets, clients)
- [ ] Lista de usuários/memberships read-only
- [ ] Aba ou seção no `PlatformOrganizationDetail`

**Estimativa:** 1 PR.

### Fase D — Admins plataforma

- [ ] `/platform/admins` + actions promote/demote
- [ ] Nav sidebar
- [ ] Migração: `is_platform_master` field backfill
- [ ] Documentar coexistência com `promote-master.ts`

**Estimativa:** 1 PR.

### Fase E — Dashboard polish

- [ ] Export CSV orgs
- [ ] Modal renovar licença rápida
- [ ] Skeletons / empty states
- [ ] Widget vencimentos 30d (se não coberto por alertas)

**Estimativa:** 1 PR (pode ser parcial).

### Fase F — Trial automático (opcional)

- [ ] Default `license_expires_at` ao criar trial
- [ ] Decisão D6 aplicada

**Estimativa:** PR pequeno, após A.

### Fase G — Docs

- [ ] Amend PAZINI-100 spec (seção 12 + roles)
- [ ] Checklist deploy revenda

---

## 8. Critérios de aceite

### Enforcement (Fase A)

- [ ] **CA-101:** Org inativa — usuário com membership não consegue login nem trocar para ela.
- [ ] **CA-102:** Licença vencida — idem.
- [ ] **CA-103:** Org ativa com licença válida — login normal.
- [ ] **CA-104:** Platform admin não afetado (não usa tenant session).
- [ ] **CA-105:** Convite respeita `max_users` (já existente).

### Operação (Fase B–D)

- [ ] **CA-110:** Platform admin reativa org; usuário volta a logar após CA-101 cenário inverso.
- [ ] **CA-111:** Filtros lista orgs funcionam com 3+ orgs fixture.
- [ ] **CA-120:** Detalhe org mostra usuários e contagens sem expor ações de convite.
- [ ] **CA-130:** Promover/demover platform admin via UI; último admin protegido.

### Regressão

- [ ] **CA-200:** `npm run test:tenant-isolation` continua verde.
- [ ] **CA-201:** Novo script enforcement verde em CI/local.

---

## 9. Testes

### 9.1 Automatizado

| Script | Cobertura |
|--------|-----------|
| `test:tenant-isolation` | Isolamento dados (existente) |
| `test:platform-license` (novo) | Login block inactive/expired; platform master bypass |
| `test:platform-admins` (novo, Fase D) | Promote/demote flags |

Fixtures mínimas:

- `tenant:active` + licença futura → OK
- `tenant:inactive` → block
- `tenant:expired` → block
- User `platform_master` → `/platform` only

### 9.2 Manual (roteiro revenda)

1. Login platform admin → dashboard MRR correto após editar `/platform/licenses`.
2. Criar org trial + standard; verificar limites ao convidar.
3. Desativar org → usuário não loga.
4. Reativar → usuário loga.
5. Vencer licença (data passada) → bloqueio.
6. Renovar data → acesso restaurado.
7. Promover segundo platform admin via UI.
8. Acessar Pazini como usuário org (não platform admin).

---

## 10. NFRs

- **Segurança:** Platform actions sempre `assertPlatformMasterSession`; enforcement no servidor, nunca só UI.
- **UX:** Mensagens de bloqueio em português, sem jargão técnico.
- **Performance:** Listagem orgs O(n) memberships — aceitável até ~100 orgs; paginação se n > 200 (backlog).
- **Compatibilidade:** SurrealDB v3; tabela `platform_license_settings` idempotente no schema.

---

## 11. Decisões abertas

| # | Decisão | Proposta default |
|---|---------|------------------|
| D6 | Trial expirado: desativar org ou só bloquear login? | Bloquear login; manter `active: true` para admin renovar |
| D7 | Org inativa: soft block ou remover memberships? | Soft block (active=false); memberships preservadas |
| D8 | Platform admin vê senhas/users? | Não; só metadados (email, role, status) |
| D9 | CSV export inclui PII? | Sim (email admin org); restringir a platform admin |
| D10 | MRR usa preço histórico ou preço atual? | Preço **atual** da config (simples); histórico = PAZINI-102 |

---

## 12. Ordem de execução recomendada

```
A (enforcement) → B (reativar/filtros) → C (métricas/usuários) → D (admins) → E (polish) → F (trial auto) → G (docs)
```

**Começar por A** — sem enforcement, o painel é informativo mas não governa o SaaS.

---

## 13. Checklist rápido

- [x] Baseline código `/platform` documentado
- [x] Modelo platform vs org cliente clarificado
- [x] RF por fase testáveis
- [x] Plano de PRs incrementais
- [x] Critérios de aceite
- [ ] **Aprovação stakeholder**
- [ ] Início Fase A na branch `PAZINI-101`

---

## 14. Referência rápida — arquivos atuais

| Área | Caminho |
|------|---------|
| Dashboard | `front/src/app/platform/page.tsx`, `platform-dashboard.tsx` |
| Orgs | `front/src/actions/platform-actions.ts` |
| Planos/preços | `front/src/actions/platform-license-actions.ts`, `/platform/licenses` |
| Sessão platform | `front/src/lib/tenant-context.ts` |
| Preços default | `front/src/lib/platform-license.ts` |
| Promote script | `front/scripts/promote-master.ts` |
| Proxy rotas | `front/src/proxy.ts` |

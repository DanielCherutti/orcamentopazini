# PAZINI-102 — Impersonate (suporte) e URL/domínio por cliente

**Branch sugerida:** `PAZINI-102` (após PAZINI-101)  
**Referências:** `20260620120000000-pazini-101-platform-reseller.spec.md`, `20260601120000000-pazini-100-multi-tenant.spec.md`, `00-deployment.spec.md`

## 1. Contexto e objetivo

### 1.1 Problema

Dois cenários recorrentes em SaaS B2B que a PAZINI-101 deixa para depois:

1. **Suporte técnico** precisa reproduzir um bug ou orientar configuração **dentro** do app operacional de uma org, sem pedir senha do cliente.
2. **White-label / marca própria** exige que cada cliente acesse por URL reconhecível (`engenharia-xyz.pazini.app` ou `portal.cliente.com.br`), não só por sessão interna.

Ambos exigem mudanças em **sessão**, **proxy/middleware**, **auditoria** e **infra** — com riscos legais (LGPD) e de segurança se mal implementados.

### 1.2 Objetivo

Especificar de forma implementável:

- **Modo suporte (impersonate)** — platform admin entra na org cliente de forma **auditada**, **visível** e **limitada no tempo**, sem membership permanente.
- **Resolução de tenant por URL** — subdomínio da plataforma (fase 1) e domínio customizado do cliente (fase 2).

### 1.3 Escopo

| Incluído | Fora |
|----------|------|
| Impersonate read-only e full (configurável) | Cobrança / billing |
| Audit log de impersonate | Audit log genérico de toda ação platform |
| Subdomínio `{slug}.{APP_DOMAIN}` | Multi-region / sharding |
| Domínio customizado `portal.cliente.com.br` | App mobile nativo |
| Banner “modo suporte” + sair | SSO/SAML por tenant |
| Validação DNS + TLS (procedimento) | CDN de assets por tenant |

**Dependências:** PAZINI-101 Fase A (enforcement de licença) concluída — impersonate não deve contornar org inativa sem flag explícita de suporte.

---

## 2. Impersonate — “Entrar como suporte”

### 2.1 Princípios (legal + produto)

| Princípio | Implementação |
|-----------|---------------|
| **Transparência** | Banner fixo em todas as páginas operacionais durante impersonate |
| **Finalidade legítima** | Apenas platform admins; motivo obrigatório (texto livre ou enum) |
| **Minimização (LGPD)** | Preferir modo **read-only**; full access só quando necessário |
| **Rastreabilidade** | Todo início/fim/ação sensível registrado em `platform_audit_log` |
| **Não repudiar senha** | Nunca ver, alterar ou solicitar senha do usuário cliente |
| **Tempo limitado** | Sessão impersonate com TTL curto (default 60 min, max 4 h) |
| **Consentimento contratual** | Termos SaaS devem prever acesso de suporte (ver §2.8) |

### 2.2 Modelo de sessão (evolução v2 → v2.1)

Estender `SessionPayloadV2`:

```typescript
type SessionPayloadV2 = {
  v: 2;
  sub: string;              // e-mail do platform admin (identidade real)
  exp: number;
  tenantId?: string;
  role?: "admin" | "user";  // role efetiva na org (default admin para suporte)
  pending?: boolean;
  platformMode?: boolean;
  /** PAZINI-102 */
  impersonation?: {
    tenantId: string;
    tenantSlug: string;
    mode: "readonly" | "full";
    reason: string;         // motivo informado ao iniciar
    startedAt: string;      // ISO
    expiresAt: string;      // ISO — TTL independente do exp global
    auditId: string;        // platform_audit_log:id
  };
};
```

Regras:

- `platformMode` e `impersonation` são **mutuamente exclusivos** no token ativo.
- Durante impersonate: `sub` permanece o e-mail do **admin real**; UI mostra org impersonada.
- Ao expirar `impersonation.expiresAt`, próximo request redireciona para `/platform` com aviso.
- Cookie continua httpOnly; **não** emitir segundo cookie para o cliente.

### 2.3 Fluxo

```
Platform admin em /platform/organizations/[slug]
  → Clica "Entrar como suporte"
  → Modal: motivo (obrig.), modo (readonly/full), duração (30/60/120 min)
  → startImpersonationAction(slug, ...)
  → INSERT platform_audit_log (action: impersonation_start)
  → setSessionContext({ email, tenantId, role: admin, impersonation: {...} })
  → Redirect /dashboard
  → Layout operacional exibe SupportModeBanner
  → "Sair do modo suporte" → endImpersonationAction → audit impersonation_end → /platform
```

### 2.4 Enforcement no servidor

| Camada | Comportamento |
|--------|---------------|
| `proxy.ts` | Se `impersonation` presente: permitir rotas operacionais; bloquear `/platform` até sair (ou link explícito “Voltar ao painel” encerra) |
| `assertTenantSession()` | Validar `tenantId === impersonation.tenantId`; checar `expiresAt` |
| `assertRole(["admin"])` | Impersonate usa role `admin` efetiva |
| Mutations | Se `mode === readonly"`: bloquear Server Actions de escrita (lista allowlist de leitura) |
| Convites / usuários | **Bloqueado** em readonly e **recomendado bloquear** em full (suporte não gerencia RH) |
| Upload / delete | Bloqueado em readonly; full permitido com audit extra |

Lista **readonly allowlist** (exemplos): list/get produtos, clientes, orçamentos, settings read, dashboard counts.

Lista **sempre bloqueada** em impersonate (readonly e full):

- Remover usuários do portal
- Alterar senha de terceiros
- Promover platform admin
- Export de pacote completo com PII em massa (decisão D12 — ver §8)

### 2.5 UI

| Componente | Descrição |
|------------|-----------|
| `SupportModeBanner` | Barra superior âmbar: “Modo suporte — {org} — {admin email} — expira em {countdown}” + botão Sair |
| Botão no detalhe org | `/platform/organizations/[slug]` — “Entrar como suporte” |
| Histórico | Aba “Auditoria” no detalhe org — últimos impersonates (quem, quando, motivo, duração) |

### 2.6 Persistência — audit

```sql
DEFINE TABLE IF NOT EXISTS platform_audit_log SCHEMALESS;
DEFINE INDEX IF NOT EXISTS idx_platform_audit_tenant ON platform_audit_log FIELDS tenant_id;
DEFINE INDEX IF NOT EXISTS idx_platform_audit_at ON platform_audit_log FIELDS created_at;
```

Registro exemplo:

```typescript
{
  id: "platform_audit_log:...",
  action: "impersonation_start" | "impersonation_end" | "impersonation_expired",
  actor_email: string,      // platform admin
  tenant_id: string,
  tenant_slug: string,
  reason?: string,
  mode?: "readonly" | "full",
  metadata?: Record<string, unknown>,
  created_at: string,
  ended_at?: string,
}
```

Retenção sugerida: **24 meses** (configurável); export CSV para compliance.

### 2.7 Requisitos funcionais — impersonate

- **RF-201:** Apenas `is_platform_master` pode iniciar impersonate.
- **RF-202:** Motivo obrigatório (mín. 10 caracteres).
- **RF-203:** TTL configurável 30 / 60 / 120 min (default 60).
- **RF-204:** Modo default **readonly**; full exige confirmação extra (“Entendo que ações serão auditadas”).
- **RF-205:** Banner visível em 100% das páginas `(main)/*` durante impersonate.
- **RF-206:** `endImpersonationAction` restaura sessão `platformMode` (volta ao painel).
- **RF-207:** Org inativa: impersonate **permitido** apenas para platform admin (suporte investiga); usuários normais continuam bloqueados (PAZINI-101).
- **RF-208:** Licença vencida: idem RF-207.
- **RF-209:** Log de impersonate visível no detalhe da org (platform admin).
- **RF-210:** Notificação opcional ao admin da org (e-mail “Suporte acessou sua organização”) — feature flag `PLATFORM_IMPERSONATION_NOTIFY=true` (fase 2.1).

### 2.8 LGPD e contrato (checklist legal — responsabilidade do negócio)

Documentar nos **Termos de Uso / DPA** do SaaS (texto jurídico fora do código):

- [ ] Cláusula de acesso técnico para suporte e manutenção
- [ ] Finalidades: diagnóstico, configuração, treinamento, incidentes
- [ ] Prazo de retenção de logs de acesso
- [ ] Direito do cliente de solicitar relatório de acessos de suporte
- [ ] Proibição de uso comercial dos dados visualizados em suporte

**No produto:**

- [ ] Política de privacidade linkada no banner (opcional)
- [ ] Export de logs de impersonate por org (CSV) para atendimento a titulares

> ⚠️ Esta spec **não substitui** assessoria jurídica. Implementação técnica assume base contratual existente.

### 2.9 Critérios de aceite — impersonate

- [ ] **CA-201:** Platform admin entra em org readonly; consegue listar orçamentos; **não** consegue criar produto.
- [ ] **CA-202:** Full mode permite criar registro; audit registra start/end.
- [ ] **CA-203:** Após TTL, redirect automático para `/platform`.
- [ ] **CA-204:** Usuário org normal **não** consegue iniciar impersonate.
- [ ] **CA-205:** Banner sempre visível; Sair encerra sessão impersonate.
- [ ] **CA-206:** `sub` no token continua sendo o admin real (verificável em logs).

### 2.10 Testes

- `scripts/platform-impersonation-regression.ts`:
  - start readonly → GET ok, POST blocked
  - start full → POST ok
  - expired session → redirect
  - non-master → 403

---

## 3. URL e domínio por cliente

### 3.1 Estratégia em duas fases

| Fase | URL exemplo | Complexidade | Quando usar |
|------|-------------|--------------|-------------|
| **3.A Subdomínio plataforma** | `engenharia-xyz.app.pazini.com.br` | Média | Revenda padrão; SSL wildcard |
| **3.B Domínio customizado** | `portal.engenhariaxyz.com.br` | Alta | Clientes enterprise / white-label |

**Modelo atual (PAZINI-100):** tenant só na **sessão** (`tenantId` no JWT), URL única (`app.pazini.com.br/dashboard`).

**Modelo alvo:** host HTTP resolve `tenant` **antes** da sessão; sessão deve **concordar** com host (anti-cross-tenant).

### 3.2 Modelo de dados

Estender `tenant`:

```typescript
type Tenant = {
  // ... existentes
  /** Subdomínio reservado na plataforma (default = slug) */
  subdomain?: string;
  /** Domínio customizado verificado (Fase 3.B) */
  custom_domain?: string | null;
  custom_domain_verified_at?: string | null;
  /** Desabilitar login pelo domínio principal compartilhado (opcional enterprise) */
  require_custom_host?: boolean;
};
```

Tabela auxiliar (Fase 3.B):

```sql
DEFINE TABLE IF NOT EXISTS tenant_domain_verification SCHEMALESS;
-- token TXT, domain, tenant_id, verified_at, last_check_at
```

Índices:

```sql
DEFINE INDEX IF NOT EXISTS idx_tenant_subdomain ON tenant FIELDS subdomain UNIQUE;
DEFINE INDEX IF NOT EXISTS idx_tenant_custom_domain ON tenant FIELDS custom_domain UNIQUE;
```

### 3.3 Resolução de host (middleware)

Novo helper `resolveTenantFromHost(host: string)`:

```
host = request.headers.get("host")

1. Se host === APP_PRIMARY_HOST (ex. app.pazini.com.br)
   → tenant null (login genérico / platform / select-tenant)

2. Se host match *.APP_DOMAIN (ex. engenharia-xyz.app.pazini.com.br)
   → subdomain = primeiro label
   → SELECT tenant WHERE subdomain = $sub OR slug = $sub

3. Se host match tenant.custom_domain (verified)
   → SELECT tenant WHERE custom_domain = $host

4. Senão → 404 tenant not found (página branded genérica)
```

Integração em `proxy.ts` (ou `middleware.ts`):

- Anexar header interno `x-resolved-tenant-id` (somente server-side)
- Login naquele host: auto-selecionar tenant se membership existir
- Sessão com `tenantId` diferente do host → logout ou redirect para host correto

### 3.4 Sessão vs host — regra de concordância

| Situação | Ação |
|----------|------|
| Host resolve tenant A, sessão tenant B | Invalidar sessão ou redirect para host de B |
| Host resolve tenant A, login multi-org | Filtrar seleção só org A (se user member) |
| Platform admin em `/platform` | Host primário; sem resolução tenant |
| Impersonate | Host deve ser primário **ou** host da org impersonada |

Cookie `Domain`:

- Domínio primário: `Domain=.app.pazini.com.br` — cookie compartilhado entre subdomínios **da plataforma**
- Domínio customizado: cookie **host-only** (`portal.cliente.com`) — sessão **não** vaza para outros clientes
- Implicação: usuário multi-org em domínios customizados precisa login separado por host (aceitável)

### 3.5 Fase 3.A — Subdomínio plataforma

**RF-301:** Ao criar org, `subdomain` default = `slug` (validar DNS-safe, único).
**RF-302:** Platform admin edita subdomain no detalhe org (com redirect 301 slug antigo → novo se aplicável).
**RF-303:** URL de convite e links em e-mail usam `https://{subdomain}.{APP_DOMAIN}` quando configurado.
**RF-304:** Página login no subdomínio mostra branding da org (`proposal_settings`).
**RF-305:** Wildcard TLS `*.app.pazini.com.br` no reverse proxy (Traefik/Caddy/Nginx).

Variáveis de ambiente:

```env
APP_PRIMARY_HOST=app.pazini.com.br
APP_TENANT_DOMAIN=app.pazini.com.br   # base para subdomínios
NEXT_PUBLIC_APP_URL=https://app.pazini.com.br  # fallback links genéricos
```

**Infra (00-deployment):**

- Certificado wildcard (Let's Encrypt DNS-01 ou Cloudflare)
- Reverse proxy: `Host` → upstream Next.js (mesma instância)
- `next.config.ts` `images.remotePatterns`: incluir wildcard hostname ou resolver dinamicamente

### 3.6 Fase 3.B — Domínio customizado

**RF-310:** Platform admin cadastra `custom_domain` no detalhe org.
**RF-311:** Sistema gera instrução DNS:
  - **CNAME** `portal.cliente.com` → `{subdomain}.app.pazini.com.br` (preferido)
  - ou **TXT** `_pazini-verify.portal.cliente.com` = token para verificação
**RF-312:** Job ou botão “Verificar DNS” confirma CNAME/TXT; seta `custom_domain_verified_at`.
**RF-313:** TLS: certificado por domínio via ACME no proxy (Caddy/Traefik on-demand TLS).
**RF-314:** Links públicos (PDF, convites) preferem `custom_domain` quando verificado.
**RF-315:** `require_custom_host`: se true, bloquear login pelo subdomínio plataforma (só custom domain).

Fluxo verificação:

```
1. Admin cadastra portal.engenhariaxyz.com.br
2. UI mostra: CNAME → engenharia-xyz.app.pazini.com.br
3. Cliente configura DNS
4. verifyCustomDomainAction → HTTP check Host header ou DNS lookup
5. verified_at preenchido → tráfego aceito
```

### 3.7 Branding e URLs absolutas

Hoje `NEXT_PUBLIC_APP_URL` é global. Com multi-host:

| Uso | Resolução |
|-----|-----------|
| Links em e-mail de convite | `getTenantPublicOrigin(tenant)` |
| PDF / imagens absolutas | Idem, por tenant da sessão |
| Uploads `/api/uploads/...` | Path pode incluir `tenant_slug` (PAZINI-100 D5 backlog) |
| WOPI / Collabora | `WOPI_PUBLIC_APP_URL` por tenant ou host da request |

Novo helper:

```typescript
function getTenantPublicOrigin(tenant: Tenant, requestHost?: string): string {
  if (tenant.custom_domain_verified_at && tenant.custom_domain)
    return `https://${tenant.custom_domain}`;
  const sub = tenant.subdomain ?? tenant.slug;
  return `https://${sub}.${process.env.APP_TENANT_DOMAIN}`;
}
```

### 3.8 UI platform

| Local | Conteúdo |
|-------|----------|
| Detalhe org → aba **Acesso** | Subdomínio editável, preview URL, copy link |
| Detalhe org → **Domínio customizado** | Input domain, status verificação, instruções DNS |
| Criar org | Preview `https://{slug}.app.pazini.com.br` |

### 3.9 Segurança

- **Host header injection:** whitelist de hosts conhecidos; rejeitar Host arbitrário
- **Takeover de subdomain:** subdomains reservados: `www`, `app`, `platform`, `api`, `admin`, `mail`
- **Custom domain:** exigir verificação DNS antes de servir app
- **HSTS** no domínio primário e custom domains
- **Rate limit** login por host (já existe por IP no proxy)

### 3.10 Critérios de aceite — domínios

- [ ] **CA-301:** Org `engenharia-xyz` acessível em `https://engenharia-xyz.app.pazini.com.br/login` com logo da org.
- [ ] **CA-302:** Usuário member loga no subdomínio → dashboard scoped; não vê dados de outra org.
- [ ] **CA-303:** Sessão de tenant A no host de tenant B → bloqueio/redirect.
- [ ] **CA-304:** Custom domain verificado serve app com TLS válido.
- [ ] **CA-305:** Convite enviado contém link do subdomínio (ou custom domain se verificado).
- [ ] **CA-306:** Platform `/platform` continua apenas no host primário.

### 3.11 Testes

- `scripts/tenant-host-resolution-regression.ts` — mock Host header → tenant id
- Manual: dois subdomínios, dois browsers, isolamento
- Manual: CNAME custom domain + verify

---

## 4. Plano de implementação

### Fase 1 — Impersonate core (2 PRs)

**PR-1:** Schema audit + session payload + actions start/end + banner  
**PR-2:** Readonly enforcement em actions + regression script

Depende: PAZINI-101 Fase A.

### Fase 2 — Impersonate polish (1 PR)

- Histórico audit na UI org
- E-mail opcional ao admin org
- Export CSV logs por org

### Fase 3.A — Subdomínio (2 PRs)

**PR-3:** `subdomain` field + resolveTenantFromHost + proxy + login branded  
**PR-4:** Links convite/PDF + platform UI aba Acesso + deploy wildcard doc

### Fase 3.B — Domínio customizado (2–3 PRs)

**PR-5:** Verificação DNS + UI  
**PR-6:** ACME/TLS doc + proxy config  
**PR-7:** `require_custom_host` + edge cases multi-org

Ordem recomendada:

```
Impersonate (1→2)  ||  Subdomínio (3.A)   — podem paralelizar equipes
Domínio custom (3.B) — após 3.A estável em produção
```

---

## 5. Contratos técnicos (resumo)

### 5.1 Actions novas

| Action | Spec |
|--------|------|
| `startImpersonationAction(slug, reason, mode, ttlMin)` | RF-201–204 |
| `endImpersonationAction()` | RF-206 |
| `listImpersonationAuditAction(tenantRef)` | RF-209 |
| `updateTenantSubdomainAction(tenantRef, subdomain)` | RF-302 |
| `setCustomDomainAction(tenantRef, domain)` | RF-310 |
| `verifyCustomDomainAction(tenantRef)` | RF-312 |

### 5.2 Arquivos impactados (estimativa)

| Arquivo | Mudança |
|---------|---------|
| `session-token.ts` | `impersonation` optional |
| `tenant-context.ts` | helpers impersonate / assert |
| `proxy.ts` | host resolution + impersonation routes |
| `lib/tenant-host.ts` | **novo** — resolveTenantFromHost |
| `lib/tenant-public-origin.ts` | **novo** — URLs por tenant |
| `components/platform/support-mode-banner.tsx` | **novo** |
| `platform-organization-detail.tsx` | botões suporte + aba Acesso |
| `next.config.ts` | remotePatterns dinâmico / permissivo |
| `smtp-config.ts` / convites | origin por tenant |

---

## 6. Decisões abertas

| # | Decisão | Proposta default |
|---|---------|------------------|
| D11 | Impersonate default mode | `readonly` |
| D12 | Export pacote .pazini em impersonate | Bloqueado sempre |
| D13 | Notificar admin org por e-mail | Off por default; flag env |
| D14 | Subdomínio = slug sempre ou editável? | Editável, default slug |
| D15 | Path-based `/t/slug` como fallback? | **Não** — só host-based (menos confusão com sessão) |
| D16 | Um usuário multi-org em subdomínios | Login por host; sem cookie global cross-custom-domain |
| D17 | Platform admin URL | Sempre `app.pazini.com.br/platform` (host primário) |

---

## 7. NFRs

- **Segurança:** Impersonate e custom domain são vetores de alto risco — code review obrigatório + testes automatizados.
- **Observabilidade:** Log estruturado `impersonation_start`, `tenant_host_mismatch`, `custom_domain_verified`.
- **Performance:** Cache in-memory de `host → tenant_id` (TTL 60s) para evitar query por request.
- **Compatibilidade:** Host primário sem subdomínio continua funcionando (grandfathering).

---

## 8. Checklist rápido

- [x] Impersonate: legal, sessão, audit, UI, readonly
- [x] Domínio: subdomínio + custom + DNS/TLS + cookies
- [x] RF e CA numerados
- [x] Plano de PRs
- [ ] Aprovação stakeholder
- [ ] PAZINI-101 Fase A concluída
- [ ] Início implementação

---

## 9. Referência — estado atual

- Tenant na sessão JWT v2; **sem** resolução por Host
- `NEXT_PUBLIC_APP_URL` único global
- Platform admin isolado em `platformMode`
- Branding por org em `proposal_settings` (logo/cores) — reutilizar na login page por host

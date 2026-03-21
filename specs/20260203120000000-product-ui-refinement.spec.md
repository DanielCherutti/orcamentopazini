# 20260203120000000 - Refinamento de UI/UX de Produtos

Esta especificação define os requisitos de refinamento da experiência do usuário no gerenciamento de produtos: feedback visual, loading states, paginação avançada e responsividade mobile.

## 1. Contexto e Objetivo

### 1.1 Contexto
O módulo de produtos (`20260127231000001-product-management.spec.md`) necessita de refinamentos de UX para feedback profissional, estados de carregamento e uso em dispositivos móveis.

### 1.2 Objetivo
Refinar a experiência com feedback visual imediato, loading states em todas as operações, paginação avançada e layout responsivo (desktop/tablet/mobile).

### 1.3 Escopo
- **Dentro:** Toasts, skeletons, spinners, paginação avançada, busca com badge, cards mobile, atalhos de teclado, acessibilidade.
- **Fora:** Alterações no modelo de dados ou fluxos de negócio.

---

## 2. Requisitos Funcionais

### 2.1 Sistema de Notificações (Toast)
- Feedback em todas as ações: criar, editar, excluir.
- Variantes: sucesso (verde), erro (vermelho), aviso (âmbar), informação (azul).
- Mensagens curtas e acionáveis.
- Duração configurável (padrão ~5s).

### 2.2 Loading States
- **Skeleton:** Durante carregamento de lista; shimmer animation.
- **Spinner:** No botão de submit durante salvamento.
- **Suspense:** Boundaries para transições suaves.
- Botão desabilitado durante submit.

### 2.3 Paginação Avançada
- Números de página clicáveis (1, 2, 3, ..., N).
- Ellipsis inteligente quando muitas páginas.
- Seletor de itens por página: 10, 25, 50, 100.
- Contador: "Mostrando X-Y de Z produtos".
- Persistência na URL (searchParams).
- Reset para página 1 ao alterar limite ou busca.

### 2.4 Busca Aprimorada
- Badge de busca ativa exibindo o termo.
- Botão para limpar busca.
- Debounce (300ms).
- Feedback: "Nenhum produto encontrado para 'termo'".

### 2.5 Responsividade Mobile
- **Desktop (≥768px):** Tabela completa.
- **Mobile (<768px):** Cards compactos em vez de tabela.
- Touch targets ≥ 44px.
- Teclado numérico em campos de preço.

### 2.6 Atalhos de Teclado
- **← (Arrow Left):** Página anterior.
- **→ (Arrow Right):** Próxima página.
- Ignorar quando foco em input (usuário digitando).

---

## 3. Contratos e Interfaces

### 3.1 Componentes
- Toast: variantes success, error, warning, info.
- Skeleton: shimmer, variantes (text, circle, rectangle).
- LoadingSpinner: tamanhos sm, md, lg.
- PaginationAdvanced: currentPage, totalPages, baseUrl, searchParams.
- ItemsPerPageSelector: opções 10/25/50/100.
- SearchBadge: termo, onClear.
- ProductCard: layout mobile-friendly.

### 3.2 Rotas
- Listagem: `/dashboard/products` (com searchParams para page, limit, query).

---

## 4. NFRs (Não Funcionais)

### 4.1 Design
- **Geometria:** Bordas sharp (rounded-sm, 2-4px).
- **Paleta:** Success Green-500, Error Red-500, Warning Amber-500, Info Blue-500.
- **Restrição:** Sem roxo/violeta.
- **Animações:** GPU-accelerated (transform, opacity); shimmer 1.5s ease-in-out.

### 4.2 Acessibilidade (WCAG 2.1 AA)
- ARIA labels em navegação.
- Navegação por teclado.
- Focus indicators visíveis.
- Screen reader friendly.
- Contraste de cores adequado.

### 4.3 Performance
- Debounce em busca (300ms).
- Lazy loading com Suspense.
- Skeleton durante transições.

---

## 5. Fluxos e Estados

### 5.1 Fluxo de Feedback
1. Usuário executa ação (criar/editar/excluir).
2. Sistema exibe loading (spinner/skeleton).
3. Sucesso → Toast verde + redirecionamento ou atualização.
4. Erro → Toast vermelho + mensagem; dados preservados.

### 5.2 Estados de Listagem
- Carregando: Skeleton visível.
- Vazia: "Nenhum produto encontrado".
- Com dados: Tabela (desktop) ou Cards (mobile).
- Busca ativa: Badge com termo + botão limpar.

---

## 6. Critérios de Aceite

- [x] Toast em todas as ações (criar/editar/excluir)
- [x] Skeleton durante carregamento de lista
- [x] Spinner no botão durante submit
- [x] Paginação com números de página
- [x] Seletor de itens por página (10/25/50/100)
- [x] Badge de busca ativa com limpar
- [x] Mobile: tabela vira cards em <768px
- [x] Atalhos de teclado (← →) para paginação
- [x] Geometria sharp em componentes
- [x] Paleta sem roxo
- [x] Acessibilidade WCAG 2.1 AA

---

## 7. Referências

### 7.1 Spec Relacionada
- `20260127231000001-product-management.spec.md` - Gestão de Produtos

### 7.2 Guardrails
- Usar componentes shadcn/ui existentes.
- Não adicionar dependências pesadas sem aprovação.
- Seguir `01-design-system.spec.md`.

---

## 8. Abertos / Fora de Escopo

- Infinite scroll como alternativa à paginação
- Toast com promise (loading → success/error)
- Atalho "/" para focar busca

## Checklist Rápido

- [x] Requisitos funcionais claros e testáveis?
- [x] Interfaces (componentes) definidas?
- [x] NFRs de design e acessibilidade?

# SDD-pdf-engine.md

> **Status:** DRAFT → Alinhado com 20260131120000000-budget-workspace.spec.md  
> **Feature:** Gerador de Proposta Comercial PDF  
> **Epic:** Sistema de Orçamentos Pazini  
> **Referência:** `refs/pazini-v1/docs/proposta-comercial-base-de-exemplo.pdf`

## 1. Visão Geral

Este documento especifica a **engine de geração de PDF** para propostas comerciais do sistema Pazini. O objetivo é reproduzir com fidelidade **pixel-perfect** o design e estrutura do documento de referência `proposta-comercial-base-de-exemplo.pdf`, utilizando `@react-pdf/renderer` como motor de renderização server-side.

### 1.1 Contexto
A proposta comercial é o **output final** do workflow de orçamentos, onde:
- Hierarquia: Budget → Locations → Sections → Items
- **Seções (Trechos)** possuem **imagens anotadas** (`composed_url`)
- Imagens mostram visualmente onde cada produto será instalado (stickers, numeração)

### 1.2 Objetivo
Gerar PDF profissional que:
1. Segue identidade visual Pazini (cores, fontes, margens)
2. Reproduz estrutura do template referência
3. Inclui imagens anotadas em alta qualidade
4. Mostra cálculos precisos (até centavo)
5. É imprimível e exportável

---

## 2. Tecnologia Escolhida

### 2.1 Engine Principal
**Decisão:** `@react-pdf/renderer` (versão 4.x)

**Por quê:**
- ✅ Controle preciso de layout com Flexbox
- ✅ Componentes React reutilizáveis
- ✅ Renderização server-side (Next.js Route Handler)
- ✅ Quebras de página inteligentes
- ✅ Fontes customizadas embutidas
- ✅ Cross-platform (renderiza igual em Windows/Mac/Linux)
- ✅ Superior a HTML-to-Print para documentos formais multipáginas

### 2.2 Merge de Anexos (Manuais Técnicos)
**Decisão:** `pdf-lib` (para concatenar PDFs)

**Uso:**
- Merge da proposta com manuais técnicos dos produtos

---

## 3. Estrutura do Documento (Anatomia do PDF)

### 3.1 Configurações Globais (Design System)

#### Página
- **Tamanho:** A4 Portrait (210mm × 297mm)
- **Margens:** 
  - Capa: 0mm (full-bleed)
  - Páginas internas: Top 15mm, Right/Left 20mm, Bottom 15mm

#### Tipografia
```typescript
const fonts = {
  heading: 'Roboto-Bold' | 'Inter-Bold', // H1, H2
  body: 'Roboto-Regular' | 'Inter-Regular', // Texto corrido
  monospace: 'RobotoMono-Regular' // Números, códigos
};

const fontSizes = {
  h1: 24, // Título de Local
  h2: 18, // Título de Trecho
  h3: 14, // Subtítulos
  body: 11, // Texto padrão
  small: 9, // Rodapés, notas
  tiny: 7 // Fine print
};
```

#### Paleta de Cores (Pazini Brandbook)
```typescript
const colors = {
  primary: '#2E3A87',        // Azul Pazini (títulos, bordas)
  accent: '#FBB03B',         // Amarelo Pazini (destaques, CTAs)
  success: '#22C55E',        // Verde (aprovado)
  text: {
    dark: '#1E293B',         // Texto principal
    muted: '#64748B',        // Texto secundário
    light: '#94A3B8'         // Legendas
  },
  bg: {
    white: '#FFFFFF',
    muted: '#F8FAFC',
    border: '#E2E8F0'
  }
};
```

---

### 3.2 Seção 1: CAPA

**Layout:** Full-page com background (imagem ou gradiente geométrico)

**Elementos:**
```
┌────────────────────────────────────┐
│  [Logo Pazini - Topo Centro]       │
│                                    │
│                                    │
│     PROPOSTA COMERCIAL             │  (Fonte 32pt, Bold, Branco)
│                                    │
│     Nº 00001                       │  (Fonte 18pt, Accent)
│                                    │
│  ──────────────────────────────    │
│                                    │
│  Cliente: Madeireira PG Ltda       │
│  Cidade: Ponta Grossa - PR         │
│  Data: 31/01/2026                  │
│                                    │
│  [Imagem de destaque: obra/produto]│
│                                    │
└────────────────────────────────────┘
```

**Dados:**
- `budget.code` → "Proposta Comercial - 00001"
- `client.name`, `client.city`
- `budget.issue_date`
- Imagem heroica (opcional, configurável ou padrão abstrata)

---

### 3.3 Seção 2: APRESENTAÇÃO (Carta Institucional)

**Conteúdo:**
Texto rico vindo de `company_settings.presentation_text` (Rich Text via Tiptap).

**Estrutura:**
```
┌────────────────────────────────────┐
│  Prezado(a) Cliente,               │
│                                    │
│  É com grande satisfação que       │
│  apresentamos esta proposta...     │
│  (Texto institucional Pazini)      │
│                                    │
│  Atenciosamente,                   │
│  [Nome Diretor Comercial]          │
│  Diretor Comercial - Pazini        │
└────────────────────────────────────┘
```

**Dados:**
- `company_settings.presentation_text`
- `company_settings.director_name`

**Layout:**
- Texto justificado
- Espaço para assinatura (imagem ou linha)
- Padding confortável

---

### 3.4 Seção 3: DETALHAMENTO DE AMBIENTES

**Estrutura de Loop:**
```
FOR EACH location IN budget.locations
  → Renderizar Cabeçalho do Local
  FOR EACH section IN location.sections
    → Renderizar Cabeçalho do Trecho
    → Renderizar Imagem Anotada (CRÍTICO!)
    → Renderizar Tabela de Itens
    → Renderizar Subtotal do Trecho
```

#### 3.4.1 Cabeçalho do Local
```react-pdf
<View style={styles.locationHeader}>
  <Text style={styles.h1}>{location.name}</Text>
  {location.description && (
    <Text style={styles.bodyMuted}>{location.description}</Text>
  )}
</View>
```

**Estilo:**
- H1 com borda inferior (`borderBottom: 2px solid primary`)
- Background levemente colorido (`bg.muted`)

#### 3.4.2 Cabeçalho do Trecho
```react-pdf
<View style={styles.sectionHeader}>
  <Text style={styles.h2}>{section.name}</Text>
</View>
```

#### 3.4.3 Imagem Anotada (⭐ FEATURE CRÍTICA)

**Objetivo:** Mostrar visualmente onde cada produto será instalado.

**Fonte da Imagem:**
- Buscar `budget_image` onde `section_id = section.id`
- Usar `composed_url` (imagem achatada com anotações)
- **NÃO** usar `url` (imagem original sem anotações)

```react-pdf
{section.images && section.images[0]?.composed_url && (
  <Image 
    src={section.images[0].composed_url} 
    style={styles.sceneImage}
  />
)}
```

**Estilo:**
```typescript
sceneImage: {
  width: '100%',        // Largura total disponível
  maxHeight: 300,       // Limite de altura (ajustar conforme template)
  objectFit: 'contain', // Manter aspect ratio
  marginVertical: 12,
  border: '1px solid #E2E8F0',
  borderRadius: 4
}
```

**Qualidade:**
- Imagem composta deve ser gerada em **alta resolução** (pixelRatio: 3)
- Formato: PNG com transparência suportada
- Base64 ou URL pública

#### 3.4.4 Tabela de Itens

**Estrutura:**
```
┌────┬──────────────────────────┬──────┬────────────┬────────────┐
│ #  │ Descrição                │ Qtd  │ Valor Unit │ Total      │
├────┼──────────────────────────┼──────┼────────────┼────────────┤
│ 1  │ Guarda-corpo 2m (Aço)    │ 10un │ R$ 350,00  │ R$ 3.500,00│
│ 2  │ Proteção lateral plástica│ 5un  │ R$ 120,00  │ R$   600,00│
└────┴──────────────────────────┴──────┴────────────┴────────────┘
                                         SUBTOTAL:   R$ 4.100,00
```

**Implementação:**
```react-pdf
<View style={styles.table}>
  {/* Header */}
  <View style={styles.tableHeader}>
    <Text style={[styles.tableCell, { width: '5%' }]}>#</Text>
    <Text style={[styles.tableCell, { width: '50%' }]}>Descrição</Text>
    <Text style={[styles.tableCell, { width: '10%' }]}>Qtd</Text>
    <Text style={[styles.tableCell, { width: '15%' }]}>Unit</Text>
    <Text style={[styles.tableCell, { width: '20%' }]}>Total</Text>
  </View>

  {/* Rows */}
  {section.items.map((item, index) => (
    <View key={item.id} style={styles.tableRow}>
      <Text style={[styles.tableCell, { width: '5%' }]}>{index + 1}</Text>
      <Text style={[styles.tableCell, { width: '50%' }]}>{item.product_id.description}</Text>
      <Text style={[styles.tableCell, { width: '10%' }]}>{item.quantity}{item.product_id.unit}</Text>
      <Text style={[styles.tableCell, { width: '15%' }]}>{formatCurrency(item.unit_price)}</Text>
      <Text style={[styles.tableCell, { width: '20%' }]}>{formatCurrency(item.total)}</Text>
    </View>
  ))}

  {/* Subtotal */}
  <View style={styles.subtotalRow}>
    <Text style={{ width: '80%', textAlign: 'right', fontWeight: 'bold' }}>Subtotal Trecho:</Text>
    <Text style={{ width: '20%', fontWeight: 'bold' }}>{formatCurrency(sectionTotal)}</Text>
  </View>
</View>
```

**Quebra de Página:**
- Usar `wrap={true}` para permitir quebra entre linhas
- Se tabela for muito longa, considerar `break={true}` antes do trecho

---

### 3.5 Seção 4: RESUMO DE INVESTIMENTO

**Layout:**
```
┌────────────────────────────────────────┬──────────────┐
│ LOCAL / CATEGORIA                      │ VALOR        │
├────────────────────────────────────────┼──────────────┤
│ Galpão Principal                       │ R$ 10.500,00 │
│ Setor de Usinagem                      │ R$  4.500,00 │
│ Área Externa                           │ R$  2.000,00 │
└────────────────────────────────────────┴──────────────┘

  ═══════════════════════════════════════════════════════
  TOTAL GERAL:                            R$ 17.000,00
  ═══════════════════════════════════════════════════════
```

**Implementação:**
- Agrupar itens por Local
- Somar totais por Local
- **Total Geral** em destaque (fonte maior, background accent)

---

### 3.6 Seção 5: CONDIÇÕES COMERCIAIS

**Conteúdo:**
- **Forma de Pagamento:** `budget.payment_terms` (ex: "30/60/90 dias")
- **Prazo de Entrega:** `budget.delivery_time` (ex: "10 dias úteis após aprovação")
- **Validade da Proposta:** `budget.validity_days` dias a partir de `budget.issue_date`
- **Observações:** Campo texto livre

**Layout:**
```
┌────────────────────────────────────┐
│  CONDIÇÕES COMERCIAIS              │
│  ────────────────────────────────  │
│                                    │
│  Forma de Pagamento:               │
│  30/60/90 dias (sem juros)         │
│                                    │
│  Prazo de Entrega:                 │
│  10 dias úteis após aprovação      │
│                                    │
│  Validade desta Proposta:          │
│  15 dias (até 15/02/2026)          │
└────────────────────────────────────┘
```

---

### 3.7 Seção 6: TERMOS E ACEITE

**Conteúdo:**
- Texto jurídico padrão (vem de `company_settings.terms_text`)
- Área para assinatura do Cliente
- Área para assinatura da Pazini

**Layout:**
```
┌────────────────────────────────────┐
│  TERMOS E CONDIÇÕES GERAIS         │
│  ────────────────────────────────  │
│                                    │
│  1. Esta proposta é válida por...  │
│  2. Valores sujeitos a...          │
│  ...                               │
│                                    │
│  ──────────────────────────────    │
│                                    │
│  Assinatura do Cliente             │
│  _______________________________   │
│  Nome: _________________________   │
│  CPF/CNPJ: _____________________   │
│                                    │
│  ──────────────────────────────    │
│                                    │
│  Assinatura Pazini                 │
│  _______________________________   │
│  [Diretor Comercial]               │
└────────────────────────────────────┘
```

---

## 4. Dados Necessários (Backend)

### 4.1 Tabela `budget`
```sql
SELECT 
  id, code, title, description, status, total_value,
  payment_terms, delivery_time, validity_days, issue_date,
  client_id
FROM budget WHERE id = $budgetId;
```

### 4.2 Tabela `budget_location` + `budget_section` + `budget_item`
```sql
-- Query recursiva para buscar árvore completa
-- Retornar: locations[].sections[].items[]
-- Cada item deve ter product_id populado com { description, unit, price }
```

### 4.3 Tabela `budget_image`
```sql
SELECT composed_url, width, height
FROM budget_image
WHERE section_id IN (SELECT id FROM budget_section WHERE budget_id = $budgetId);
```

⚠️ **CRÍTICO:** `composed_url` é a imagem achatada (canvas + anotações). Não usar `url` (original).

### 4.4 Tabela `company_settings`
```sql
SELECT 
  logo_url,
  company_name,
  address,
  phone,
  email,
  presentation_text,
  terms_text,
  director_name,
  primary_color,
  accent_color
FROM company_settings LIMIT 1;
```

---

## 5. Implementação Técnica

### 5.1 Estrutura de Arquivos
```
front/src/
├── components/pdf/
│   ├── proposal-document.tsx         # Componente React-PDF raiz
│   ├── sections/
│   │   ├── cover-page.tsx           # Seção 1: Capa
│   │   ├── presentation-page.tsx    # Seção 2: Apresentação
│   │   ├── location-section.tsx     # Seção 3: Local loop
│   │   ├── section-detail.tsx       # Seção 3.4: Trecho com imagem+tabela
│   │   ├── budget-table.tsx         # Tabela de itens
│   │   ├── summary-page.tsx         # Seção 4: Resumo
│   │   ├── terms-page.tsx           # Seção 6: Termos
│   │   └── commercial-conditions.tsx # Seção 5: Condições
│   └── styles/
│       └── pdf-styles.ts            # Stylesheet global
├── app/api/budgets/[id]/pdf/
│   └── route.ts                     # Route Handler (GET)
└── actions/
    └── budget-pdf-actions.ts        # Server Action helper
```

### 5.2 Route Handler (API Endpoint)

**Arquivo:** `app/api/budgets/[id]/pdf/route.ts`

```typescript
import { renderToStream } from '@react-pdf/renderer';
import { ProposalDocument } from '@/components/pdf/proposal-document';
import { getBudgetFullTree } from '@/actions/budget-actions';

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const budgetId = params.id;
  const { data: budget } = await getBudgetFullTree(budgetId);

  if (!budget) {
    return new Response('Budget not found', { status: 404 });
  }

  const stream = await renderToStream(<ProposalDocument budget={budget} />);

  return new Response(stream as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="proposta-${budget.code}.pdf"`
    }
  });
}
```

### 5.3 Componente React-PDF

**Arquivo:** `components/pdf/proposal-document.tsx`

```typescript
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { CoverPage } from './sections/cover-page';
import { PresentationPage } from './sections/presentation-page';
import { LocationSection } from './sections/location-section';
import { SummaryPage } from './sections/summary-page';
import { CommercialConditions } from './sections/commercial-conditions';
import { TermsPage } from './sections/terms-page';
import type { BudgetTree } from '@/types/budget-types';

interface ProposalDocumentProps {
  budget: BudgetTree;
}

export function ProposalDocument({ budget }: ProposalDocumentProps) {
  return (
    <Document>
      {/* Capa */}
      <CoverPage budget={budget} />

      {/* Apresentação */}
      <PresentationPage />

      {/* Detalhamento por Local */}
      {budget.locations.map((location) => (
        <LocationSection key={location.id} location={location} />
      ))}

      {/* Resumo */}
      <SummaryPage budget={budget} />

      {/* Condições */}
      <CommercialConditions budget={budget} />

      {/* Termos */}
      <TermsPage />
    </Document>
  );
}
```

---

## 6. Critérios de Aceite

### 6.1 Fidelidade Visual
- [ ] Margens, fontes e cores seguem o template referência
- [ ] Espaçamentos consistentes (padding, margin)
- [ ] Cores Pazini aplicadas corretamente (Primary/Accent)
- [ ] Logo Pazini renderizada em alta qualidade
- [ ] Assinaturas têm espaço adequado

### 6.2 Qualidade de Imagens
- [ ] Imagens anotadas (`composed_url`) aparecem no PDF
- [ ] Imagens não estão pixeladas (resolução >= 2x)
- [ ] Aspect ratio preservado
- [ ] Anotações (stickers, setas) visíveis e nítidas

### 6.3 Precisão de Dados
- [ ] Número da proposta correto
- [ ] Dados do cliente corretos
- [ ] Tabela de itens com produtos corretos
- [ ] Quantidades e preços corretos
- [ ] Totais conferem centavo por centavo
- [ ] Subtotais por trecho corretos
- [ ] Total geral = soma de todos os itens

### 6.4 Quebras de Página
- [ ] Tabelas não quebram de forma feia (linhas órfãs)
- [ ] Trechos não quebram entre imagem e tabela
- [ ] Páginas não ficam em branco desnecessariamente
- [ ] Rodapé/header consistentes (se aplicável)

### 6.5 Exportação
- [ ] Botão "Ver PDF" abre PDF em nova aba
- [ ] Botão "Download PDF" baixa arquivo `.pdf`
- [ ] Nome do arquivo: `proposta-{code}.pdf`
- [ ] PDF é imprimível corretamente
- [ ] PDF abre em qualquer leitor (Adobe, Chrome, Preview)

---

## 7. Próximos Passos

### 7.1 Fase 1: Estrutura Básica ✅
- [x] Criar componentes de seções (Cover, Presentation, etc)
- [x] Criar Route Handler `/api/budgets/[id]/pdf`
- [x] Implementar fontes customizadas
- [x] Aplicar cores Pazini

### 7.2 Fase 2: Renderização de Dados
- [ ] Buscar dados completos via `getBudgetFullTree`
- [ ] Loop de Locais > Trechos > Itens funcionando
- [ ] Tabela de itens renderizada corretamente
- [ ] Cálculos de totais corretos

### 7.3 Fase 3: Imagens Anotadas ⭐
- [ ] Renderizar `composed_url` em cada trecho
- [ ] Garantir alta qualidade de imagem (pixelRatio)
- [ ] Testar com imagens reais do annotator

### 7.4 Fase 4: Polimento
- [ ] Ajustar quebras de página
- [ ] Adicionar rodapé/header (número da página, logo)
- [ ] Implementar merge de manuais técnicos (pdf-lib)
- [ ] Validar contra template referência

---

## 8. Referências

### 8.1 Docs Oficiais
- [@react-pdf/renderer Documentation](https://react-pdf.org/)
- [pdf-lib Documentation](https://pdf-lib.js.org/)

### 8.2 Specs Relacionadas
- `20260131120000000-budget-workspace.spec.md` - Workspace de Orçamentos
- `00-architecture.spec.md` - Arquitetura
- `01-design-system.spec.md` - Design System Pazini

### 8.3 Template Referência
- `refs/pazini-v1/docs/proposta-comercial-base-de-exemplo.pdf`

---

**Última atualização:** 2026-01-31  
**Status:** DRAFT → Alinhado com Budget Workspace

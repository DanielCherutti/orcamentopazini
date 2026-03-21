# 01 - Especificação de Design System & UI

Esta especificação define a identidade visual, sistema de cores, tipografia e componentes base do projeto, alinhado com a stack Next.js 16 + Tailwind CSS 4.

## 1. Contexto e Objetivo
- **Contexto:** Migração da identidade visual do projeto anterior (v1) para a nova stack.
- **Objetivo:** Estabelecer um Design System consistente, baseado nos tokens da marca "Pazini" e na biblioteca de componentes `shadcn/ui`.
- **Referência:** Extraído de `refs/pazini-v1/front/src/index.css` e `tailwind.config.ts`.

## 2. Tokens de Design

### 2.1 Cores (HSL)
O sistema utiliza variáveis CSS HSL para facilitar variação de temas (Light/Dark).

#### Brand Colors
- **Primary:** `229 52% 35%` (Azul Pazini - #2E3A87)
  - Foreground: `0 0% 100%` (Branco)
  - Hover: `229 52% 30%`
- **Accent:** `42 97% 61%` (Amarelo Pazini - #FBB03B)
  - Foreground: `220 26% 14%`
  - Hover: `42 97% 55%`

#### Base Colors
- **Background:** `220 17% 97%` (Cinza Claro - Light Mode)
- **Foreground:** `220 26% 14%` (Cinza Escuro / Texto Principal)
- **Card/Popover:** `0 0% 100%` (Branco)
- **Border/Input:** `220 13% 91%`
- **Muted:** `210 20% 96%` (Fundo sutil)

#### Semantic Colors
- **Success:** `142 76% 36%` (Verde)
- **Warning:** `38 92% 50%` (Laranja/Amarelo)
- **Destructive:** `0 84% 60%` (Vermelho)
- **Info:** `199 89% 48%` (Azul claro)

#### Sidebar Specific
- **Background:** `220 26% 14%` (Dark Blue/Grey)
- **Foreground:** `210 20% 88%` (Texto claro)
- **Primary:** `229 52% 35%`
- **Accent:** `220 20% 20%` (Hover items)

### 2.2 Tipografia
- **Font Family:** Inter (Google Font) ou `geist-sans` (Padrão Next.js) - *A definir na implementação*. Seguiremos com o padrão do Next.js (Geist) inicialmente, exceto se houver requisito de fonte específica.

### 2.3 Espaçamento e Bordas
- **Radius:** `0.75rem` (Arredondado - `rounded-xl` approx)
- **Container:** Centralizado, Padding `2rem`, Max-width `1400px` (2xl).

## 3. Biblioteca de Componentes
Utilizaremos `shadcn/ui` como base. Componentes devem ser instalados conforme demanda.

### Componentes Core (Iniciais)
- Button
- Input / Textarea
- Card
- Dialog / Sheet (Modal)
- Dropdown Menu
- Form (React Hook Form + Zod)
- Table

## 4. Integração Técnica (Tailwind 4)

### 4.1 Configuração
A configuração de cores deve ser feita preferencialmente via CSS Variables no `@theme` ou `plugin` do Tailwind, mantendo a compatibilidade com as classes do `shadcn/ui` (ex: `bg-primary`, `text-primary-foreground`).

### 4.2 Dark Mode
Suporte a Dark Mode via classe `.dark`. O sistema de cores já prevê variáveis CSS, bastando definir os valores para o seletor `.dark` (se optarmos por implementar dark mode agora).
*Nota: A referência original v1 parece ter foco em Light Mode com Sidebar escura. Manteremos isso inicialmente.*

## 5. Critérios de Aceite
- [ ] Variáveis CSS (HSL) portadas para `globals.css`.
- [ ] Cores Primary (Azul) e Accent (Amarelo) funcionando.
- [ ] Sidebar com tema escuro implementado (via tokens específicos).
- [ ] `lib/utils` criado com função `cn`.
- [ ] Build do CSS sem erros.

## 6. Abertos
- Dark mode completo será implementado? (Por enquanto, apenas estrutura).

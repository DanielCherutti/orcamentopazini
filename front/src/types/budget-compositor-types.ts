// Tipos do módulo Compositor (árvore de blocos do documento)
// Arquitetura de blocos tipados com aninhamento livre (Notion-style)

import type { BudgetItem } from "@/types/budget-types";

// ─── Tipos de Bloco ────────────────────────────────────────────────────────────

// Catálogo inicial — extensível adicionando novas strings sem migração de banco
export type BlockType =
  | "cover"     // Capa do documento (PDF / proposta) — uma por orçamento, criada automaticamente
  | "toc"       // Sumário automático (sempre após a capa) — conteúdo derivado da árvore
  | "session"   // Contêiner: sessão / sub-sessão (qualquer profundidade)
  | "text"      // Texto rico (Tiptap HTML)
  | "location"  // Local / Ambiente (com descrição + galeria + trechos)
  | "section"   // Trecho (com descrição + galeria + lista de produtos)
  | "scope"
  | (string & {});

/** Regiões da capa (ordem personalizável na vertical) */
export type CoverSectionId =
  | "company_header"
  | "main_titles"
  | "client_logo"
  | "client_cadastral"
  | "professional_footer";

export type CoverTitlePart = "main" | "subtitle";

export type CoverSectionAlign = "left" | "center" | "right";

export const COVER_SECTION_LABELS: Record<CoverSectionId, string> = {
  company_header: "Cabeçalho (empresa)",
  main_titles: "Título e subtítulo",
  client_logo: "Logomarca do cliente",
  client_cadastral: "Dados cadastrais do cliente",
  professional_footer: "Responsável, data e referência",
};

export const DEFAULT_COVER_SECTION_ORDER: CoverSectionId[] = [
  "company_header",
  "main_titles",
  "client_logo",
  "client_cadastral",
  "professional_footer",
];

export const DEFAULT_COVER_TITLES_ORDER: CoverTitlePart[] = ["main", "subtitle"];

export function normalizeCoverSectionOrder(raw: unknown): CoverSectionId[] {
  const allowed = DEFAULT_COVER_SECTION_ORDER;
  const set = new Set<string>(allowed);
  if (!Array.isArray(raw)) return [...allowed];
  const seen = new Set<string>();
  const out: CoverSectionId[] = [];
  for (const x of raw) {
    if (typeof x === "string" && set.has(x) && !seen.has(x)) {
      seen.add(x);
      out.push(x as CoverSectionId);
    }
  }
  for (const id of allowed) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

export function normalizeCoverTitlesOrder(raw: unknown): CoverTitlePart[] {
  if (!Array.isArray(raw)) return [...DEFAULT_COVER_TITLES_ORDER];
  const seen = new Set<string>();
  const out: CoverTitlePart[] = [];
  for (const x of raw) {
    if ((x === "main" || x === "subtitle") && !seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  for (const p of DEFAULT_COVER_TITLES_ORDER) {
    if (!seen.has(p)) out.push(p);
  }
  return out;
}

const DEFAULT_COVER_SECTION_ALIGN: Record<CoverSectionId, CoverSectionAlign> = {
  company_header: "left",
  main_titles: "center",
  client_logo: "center",
  client_cadastral: "left",
  professional_footer: "center",
};

export function coverSectionAlignFor(
  id: CoverSectionId,
  raw: Partial<Record<CoverSectionId, CoverSectionAlign>> | undefined
): CoverSectionAlign {
  return raw?.[id] ?? DEFAULT_COVER_SECTION_ALIGN[id];
}

/** Props do bloco capa — personalização da primeira página da proposta */
export interface CoverBlockProps {
  /** Ordem vertical das regiões na capa */
  section_order?: CoverSectionId[];
  /** Alinhamento horizontal por região */
  section_align?: Partial<Record<CoverSectionId, CoverSectionAlign>>;
  /** Ordem do título principal em relação ao subtítulo */
  titles_order?: CoverTitlePart[];
  main_title?: string;
  subtitle?: string;
  /** Logomarca do cliente (URL pública) */
  client_logo_url?: string;
  /** Marca d’água só na capa */
  cover_watermark_url?: string;
  cover_watermark_opacity?: number;
  /** Marca d’água nas páginas seguintes (uso futuro no PDF) */
  document_watermark_url?: string;
  document_watermark_opacity?: number;
  client_legal_name?: string;
  client_trade_name?: string;
  client_cnpj?: string;
  client_municipality?: string;
  client_address?: string;
  client_cep?: string;
  /** Texto livre (ex.: tipos de EC / área classificada) */
  client_classified_areas?: string;
  engineer_name?: string;
  engineer_crea?: string;
  /** Ex.: "Iraí - RS" — linha acima da data */
  issuer_city_line?: string;
  /** Ex.: "Rev. 02" — exibido junto ao código do orçamento */
  revision_label?: string;
}

export const DEFAULT_COVER_PROPS: CoverBlockProps = {
  main_title: "PROPOSTA COMERCIAL",
  subtitle: "Memorial Descritivo de Fornecimento (NR 33 E 35)",
  client_logo_url: "",
  cover_watermark_url: "",
  cover_watermark_opacity: 0.12,
  document_watermark_url: "",
  document_watermark_opacity: 0.06,
  client_legal_name: "",
  client_trade_name: "",
  client_cnpj: "",
  client_municipality: "",
  client_address: "",
  client_cep: "",
  client_classified_areas: "",
  engineer_name: "",
  engineer_crea: "",
  issuer_city_line: "",
  revision_label: "",
};

// Props específicos por tipo (contrato de dados — validação feita na Server Action)
export interface SessionBlockProps {
  collapsed?: boolean;
  description?: string; // HTML gerado pelo Tiptap
}

export interface TextBlockProps {
  content: string; // HTML gerado pelo Tiptap
}

export interface LocationBlockProps {
  description?: string; // HTML do editor rico
}

export interface SectionBlockProps {
  description?: string; // HTML do editor rico
}

// ─── Entidade Flat (como vem do banco) ────────────────────────────────────────

export interface BudgetBlockFlat {
  id: string;
  budget_id: string;
  parent_id: string | null;
  type: BlockType;
  label: string;
  order_index: number;
  props: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─── Nó da Árvore (com children aninhados, calculado no cliente) ──────────────

export interface BudgetBlock extends BudgetBlockFlat {
  children: BudgetBlock[];
  number: string;   // ex: "1", "1.2", "1.2.3" — calculado por buildTree()
  depth: number;    // profundidade na árvore (0 = raiz)
}

// ─── Árvore completa do compositor ────────────────────────────────────────────

export interface CompositorTree {
  blocks: BudgetBlock[];                        // raízes da árvore
  items: Record<string, BudgetItem[]>;          // blockId → items (para blocos type='section')
}

// ─── buildTree ─────────────────────────────────────────────────────────────────
// Converte lista plana de blocos em árvore aninhada com:
//   - children ordenados por order_index
//   - number só em blocos `session` (capa, sumário, escopo, etc. ficam sem número)
//   - depth a partir da raiz

export function buildTree(
  flatBlocks: BudgetBlockFlat[],
  items: Record<string, BudgetItem[]> = {}
): CompositorTree {
  const map = new Map<string, BudgetBlock>();

  // 1. Inicializa todos os nós sem children
  for (const b of flatBlocks) {
    map.set(b.id, { ...b, children: [], number: "", depth: 0 });
  }

  const roots: BudgetBlock[] = [];

  // 2. Monta a árvore linkando parent → children
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // 3. Ordena siblings por order_index
  const sortChildren = (nodes: BudgetBlock[]) => {
    nodes.sort((a, b) => a.order_index - b.order_index);
    for (const n of nodes) sortChildren(n.children);
  };
  sortChildren(roots);

  // 4. Numeração hierárquica apenas para sessões (1., 1.1., 2., …).
  const assignNumbers = (
    nodes: BudgetBlock[],
    sessionParentNumber: string,
    depth: number
  ) => {
    let sessionIndex = 0;
    for (const node of nodes) {
      node.depth = depth;
      if (node.type === "session") {
        sessionIndex++;
        node.number = sessionParentNumber
          ? `${sessionParentNumber}.${sessionIndex}`
          : String(sessionIndex);
        assignNumbers(node.children, node.number, depth + 1);
      } else {
        node.number = "";
        assignNumbers(node.children, sessionParentNumber, depth + 1);
      }
    }
  };
  assignNumbers(roots, "", 0);

  return { blocks: roots, items };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Retorna todos os blocos da árvore em lista plana (DFS) */
export function flattenTree(roots: BudgetBlock[]): BudgetBlock[] {
  const result: BudgetBlock[] = [];
  const visit = (nodes: BudgetBlock[]) => {
    for (const n of nodes) {
      result.push(n);
      visit(n.children);
    }
  };
  visit(roots);
  return result;
}

/** Retorna o próximo order_index para inserir como último filho */
export function nextOrderIndex(siblings: BudgetBlock[]): number {
  if (!siblings.length) return 0;
  return Math.max(...siblings.map((s) => s.order_index)) + 1;
}

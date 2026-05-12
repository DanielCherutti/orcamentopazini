// Tipos do módulo Compositor (árvore de blocos do documento)
// Arquitetura de blocos tipados com aninhamento livre (Notion-style)

import type { BudgetItem } from "@/types/budget-types";

// ─── Tipos de Bloco ────────────────────────────────────────────────────────────

// Catálogo inicial — extensível adicionando novas strings sem migração de banco
export type BlockType =
  | "cover"     // Capa do documento (PDF / proposta) — uma por orçamento, criada automaticamente
  | "header_footer" // Configuração visual de cabeçalho/rodapé (capa + páginas internas)
  | "toc"       // Sumário automático (sempre após a capa) — conteúdo derivado da árvore
  | "figures"   // Lista de figuras (após sumário) — imagens do Escopo, automático
  | "quote"     // Orçamento (tabela/valores) — bloco raiz que referencia a aba Orçamento
  | "session"   // Contêiner: sessão / sub-sessão (qualquer profundidade)
  | "text"      // Texto rico (Tiptap HTML)
  | "location"  // Local / Ambiente (com descrição + galeria + trechos)
  | "section"   // Trecho (com descrição + galeria + lista de produtos)
  | "scope"
  | (string & {});

/** Props do bloco capa — documento em HTML (fluxo tipo Word). */
export interface CoverBlockProps {
  /** Conteúdo da capa (TipTap / HTML). */
  cover_document_html?: string;
  /** Legado: usados na migração se `cover_document_html` estiver vazio. */
  main_title?: string;
  subtitle?: string;
  /** Logomarca do cliente (URL pública) */
  client_logo_url?: string;
  /** Posição/tamanho na folha A4 (%, origem canto superior esquerdo da imagem). */
  client_logo_x_pct?: number;
  client_logo_y_pct?: number;
  client_logo_width_pct?: number;
  /** naturalWidth / naturalHeight — usado no PDF e para limitar arraste. */
  client_logo_aspect?: number;
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

  /** Faixas fixas da capa no PDF (fora do HTML) — editáveis no compositor. */
  cover_pdf_show_header_band?: boolean;
  cover_pdf_show_footer_band?: boolean;
  /** Substitui o nome da empresa (Configurações) no cabeçalho do PDF. */
  cover_pdf_header_company_override?: string;
  /** Substitui a URL do logo (Configurações) no cabeçalho do PDF. */
  cover_pdf_header_logo_url_override?: string;
  /** Rodapé esquerdo. Placeholders: {{date}} {{code}} {{title}}. Vazio = texto automático. */
  cover_pdf_footer_left_template?: string;
  /** Rodapé direito. Placeholders: {{date}} {{code}} {{title}}. Vazio = texto automático. */
  cover_pdf_footer_right_template?: string;
  /** Altura da faixa superior da capa no PDF (pontos ~1/72"); arrastável no modal da capa. */
  cover_pdf_header_band_height_pt?: number;
  /** Altura da faixa inferior da capa no PDF (pontos). */
  cover_pdf_footer_band_height_pt?: number;
}

export interface HeaderFooterBlockProps {
  cover_watermark_url?: string;
  cover_watermark_opacity?: number;
  cover_watermark_scale_pct?: number;
  cover_watermark_x_pct?: number;
  cover_watermark_y_pct?: number;
  cover_watermark_width_pct?: number;
  cover_watermark_aspect?: number;
  inner_use_cover_watermark?: boolean;
  inner_watermark_url?: string;
  inner_watermark_opacity?: number;
  inner_watermark_scale_pct?: number;
  inner_watermark_x_pct?: number;
  inner_watermark_y_pct?: number;
  inner_watermark_width_pct?: number;
  inner_watermark_aspect?: number;
  cover_header_html?: string;
  cover_footer_html?: string;
  cover_header_height?: number;
  cover_footer_height?: number;
  inner_header_html?: string;
  inner_footer_html?: string;
  inner_header_height?: number;
  inner_footer_height?: number;
  /** Compatibilidade com configuração antiga da capa. */
  legacy_cover_pdf_show_header_band?: boolean;
  legacy_cover_pdf_show_footer_band?: boolean;
  legacy_cover_pdf_header_company_override?: string;
  legacy_cover_pdf_header_logo_url_override?: string;
  legacy_cover_pdf_footer_left_template?: string;
  legacy_cover_pdf_footer_right_template?: string;
}

export const DEFAULT_HEADER_FOOTER_PROPS: HeaderFooterBlockProps = {
  cover_watermark_url: "",
  cover_watermark_opacity: 0.12,
  cover_watermark_scale_pct: 100,
  cover_watermark_x_pct: 11,
  cover_watermark_y_pct: 11,
  cover_watermark_width_pct: 78,
  cover_watermark_aspect: 1,
  inner_use_cover_watermark: true,
  inner_watermark_url: "",
  inner_watermark_opacity: 0.06,
  inner_watermark_scale_pct: 100,
  inner_watermark_x_pct: 11,
  inner_watermark_y_pct: 11,
  inner_watermark_width_pct: 78,
  inner_watermark_aspect: 1,
  cover_header_html: "",
  cover_footer_html: "",
  cover_header_height: 108,
  cover_footer_height: 44,
  inner_header_html: "",
  inner_footer_html: "",
  inner_header_height: 96,
  inner_footer_height: 40,
  legacy_cover_pdf_show_header_band: true,
  legacy_cover_pdf_show_footer_band: true,
  legacy_cover_pdf_header_company_override: "",
  legacy_cover_pdf_header_logo_url_override: "",
  legacy_cover_pdf_footer_left_template: "",
  legacy_cover_pdf_footer_right_template: "",
};

export const DEFAULT_COVER_PROPS: CoverBlockProps = {
  cover_document_html:
    '<p style="text-align:center"><strong>PROPOSTA COMERCIAL</strong></p><p style="text-align:center">Memorial Descritivo de Fornecimento (NR 33 E 35)</p><p><br></p>',
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

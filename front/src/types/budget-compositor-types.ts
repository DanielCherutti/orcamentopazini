// Tipos do módulo Compositor (árvore de blocos do documento)
// Arquitetura de blocos tipados com aninhamento livre (Notion-style)

import type { BudgetItem } from "@/types/budget-types";

// ─── Tipos de Bloco ────────────────────────────────────────────────────────────

// Catálogo inicial — extensível adicionando novas strings sem migração de banco
export type BlockType =
  | "session"   // Contêiner: sessão / sub-sessão (qualquer profundidade)
  | "text"      // Texto rico (Tiptap HTML)
  | "location"  // Local / Ambiente (com descrição + galeria + trechos)
  | "section"   // Trecho (com descrição + galeria + lista de produtos)
  | (string & {});  // Tipos futuros: 'image_gallery' | 'summary' | 'checklist' | ...

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
//   - number calculado considerando apenas blocos tipo 'session' na hierarquia
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

  // 4. Calcula number e depth recursivamente.
  // Todos os tipos de bloco recebem numeração sequencial entre irmãos:
  // ex: 1 / 1.1 / 1.1.1 / 1.1.2 / 1.2
  const assignNumbers = (
    nodes: BudgetBlock[],
    parentNumber: string,
    depth: number
  ) => {
    let counter = 0;
    for (const node of nodes) {
      node.depth = depth;
      counter++;
      node.number = parentNumber ? `${parentNumber}.${counter}` : String(counter);
      assignNumbers(node.children, node.number, depth + 1);
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

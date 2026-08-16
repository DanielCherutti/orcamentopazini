"use client";

import { useState, useEffect, useRef, createContext, useContext, useMemo, type CSSProperties } from "react";
import { ChevronRight, ChevronDown, MapPin, Layers, FileText, Plus, Trash2, FolderOpen, GripVertical, Map as MapIcon, BookOpen, ListOrdered, ImageIcon, Table2, LayoutTemplate, Package, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
    useCompositorRuntime,
    isDeliveryCompositorBlockDisabled,
    type CompositorKind,
} from "./compositor-runtime-context";
import { toast } from "@/lib/toast";
import { useConfirmDialog } from "@/components/providers/confirm-dialog-provider";
import type { BudgetBlock, BlockType } from "@/types/budget-compositor-types";
import { flattenTree } from "@/types/budget-compositor-types";
import {
  COMPOSITOR_SCOPE_BLOCK_DEFAULT_LABEL,
  getCompositorPanelLabel,
  getScopeBlockLabel,
} from "./compositor-content-utils";
import { normalizeLabel } from "./compositor-content-hooks";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDndMonitor,
} from "@dnd-kit/core";
import type { CollisionDetection, DragEndEvent, DragStartEvent, Modifier } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";

// ─── Children registry context ────────────────────────────────────────────────
// Usa Record<string, BudgetBlock[]> onde null parent usa a chave "__root__"

const ROOT_KEY = "__root__";
function pKey(id: string | null): string { return id ?? ROOT_KEY; }
type ChildrenReg = Record<string, BudgetBlock[]>;

/** Painel rolável da árvore (overflow-y-auto) — usado para compensar scroll com DragOverlay. */
const compositorTreeScrollStore = {
  el: null as HTMLElement | null,
  startScrollTop: 0,
};

/**
 * Com DragOverlay, o DndContext não soma `activeNodeScrollDelta` ao translate.
 * Ao arrastar para cima, o autoscroll / scroll do painel altera `scrollTop` e o overlay
 * fica visualmente “embaixo” do ponteiro; somamos o delta de scroll em Y.
 */
const compositorOverlayScrollCompensation: Modifier = ({ transform }) => {
  const el = compositorTreeScrollStore.el;
  if (!el) return transform;
  const delta = el.scrollTop - compositorTreeScrollStore.startScrollTop;
  if (delta === 0) return transform;
  return { ...transform, y: transform.y + delta };
};

function CompositorTreeScrollCompensationBridge() {
  useDndMonitor({
    onDragStart() {
      const el = compositorTreeScrollStore.el;
      compositorTreeScrollStore.startScrollTop = el?.scrollTop ?? 0;
    },
  });
  return null;
}

interface CompositorDndCtxValue {
  childrenReg: ChildrenReg;
  activeDragId: string | null;
}
const CompositorDndCtx = createContext<CompositorDndCtxValue | null>(null);

function buildChildrenReg(roots: BudgetBlock[]): ChildrenReg {
  const reg: ChildrenReg = {};
  const visit = (blocks: BudgetBlock[], parentId: string | null) => {
    reg[pKey(parentId)] = [...blocks];
    for (const b of blocks) {
      if (b.children.length > 0) visit(b.children, b.id);
    }
  };
  visit(roots, null);
  return reg;
}

/**
 * Árvore aninhada com vários SortableContext compartilhando um DndContext:
 * sem filtro, o retângulo de colisão do pai inclui todos os filhos e o "over"
 * vira um nó interno — reordenação na raiz (ex.: Escopo) parece "bugada".
 * Só consideramos droppables com o mesmo parentId do item ativo; zonas `into:*`
 * mantêm prioridade. `parentById` cobre quando o sortable não expõe `data` no droppable.
 */
function createCompositorTreeCollisionDetection(
  parentById: Map<string, string | null>
): CollisionDetection {
  return (args) => {
    const pointerAll = pointerWithin(args);
    const intoHit = pointerAll.find((c) => String(c.id).startsWith("into:"));
    if (intoHit) return [intoHit];

    const activeId = String(args.active.id);
    const activeParentRaw =
      (args.active.data.current?.parentId as string | null | undefined) ??
      parentById.get(activeId);
    const activeParent = activeParentRaw ?? null;

    const sameParentContainers = args.droppableContainers.filter((c) => {
      const sid = String(c.id);
      if (sid.startsWith("into:")) return false;
      const fromData = c.data.current?.parentId as string | null | undefined;
      const pRaw = fromData !== undefined ? fromData : parentById.get(sid);
      return (pRaw ?? null) === activeParent;
    });

    if (sameParentContainers.length === 0) {
      return closestCenter(args);
    }

    const restricted = { ...args, droppableContainers: sameParentContainers };
    const ptr = pointerWithin(restricted);
    if (ptr.length > 0) return ptr;
    return closestCenter(restricted);
  };
}

// ─── DroppableSessionInto ─────────────────────────────────────────────────────
// Zona de drop dentro de uma seção (para soltar como filho)

function DroppableSessionInto({ blockId, depth }: { blockId: string; depth: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `into:${blockId}` });
  const indentPx = (depth + 1) * 12 + 8;
  return (
    <div ref={setNodeRef} style={{ paddingLeft: `${indentPx}px`, paddingRight: "8px" }} className="py-0.5">
      <div className={cn(
        "flex items-center gap-1.5 rounded px-2 py-1 text-xs border border-dashed transition-all duration-150",
        isOver
          ? "border-primary bg-primary/10 text-primary font-medium"
          : "border-muted-foreground/20 text-muted-foreground/30"
      )}>
        {isOver
          ? <><Plus className="h-3 w-3 shrink-0" /><span>Soltar dentro desta seção</span></>
          : <span>Arrastar seção aqui</span>
        }
      </div>
    </div>
  );
}

// ─── Ícones e opções ──────────────────────────────────────────────────────────

const BLOCK_ICONS: Record<string, React.ReactNode> = {
  cover:    <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" />,
  toc:      <ListOrdered className="h-3.5 w-3.5 shrink-0 text-primary" />,
  figures:  <ImageIcon className="h-3.5 w-3.5 shrink-0 text-primary" />,
  databook_figures: <ImageIcon className="h-3.5 w-3.5 shrink-0 text-primary" />,
  databook_installations: <Package className="h-3.5 w-3.5 shrink-0 text-primary" />,
  databook_attachments: <Paperclip className="h-3.5 w-3.5 shrink-0 text-primary" />,
  quote:    <Table2 className="h-3.5 w-3.5 shrink-0 text-primary" />,
  session:  <FolderOpen className="h-3.5 w-3.5 shrink-0" />,
  location: <MapPin className="h-3.5 w-3.5 shrink-0" />,
  section:  <Layers className="h-3.5 w-3.5 shrink-0" />,
  text:     <FileText className="h-3.5 w-3.5 shrink-0" />,
  scope:    <MapIcon className="h-3.5 w-3.5 shrink-0 text-primary" />,
  header_footer: <LayoutTemplate className="h-3.5 w-3.5 shrink-0 text-primary" />,
};

// Opções disponíveis por tipo de pai
// session → pode conter subseções, locais, texto (mas NÃO trecho direto)
// location → pode conter trechos e texto (mas NÃO seção ou local)
// null (raiz) → seção + escopo + orçamento
const ALL_OPTIONS: { type: BlockType; label: string; short: string }[] = [
  { type: "session",  label: "Subseção",        short: "Seção"  },
  { type: "location", label: "Local (ambiente)", short: "Local"   },
  { type: "section",  label: "Trecho",           short: "Trecho"  },
  { type: "text",     label: "Texto livre",      short: "Texto"   },
  { type: "scope",    label: "Bloco Detalhamento do projeto", short: COMPOSITOR_SCOPE_BLOCK_DEFAULT_LABEL },
  { type: "quote",    label: "Bloco Orçamento",  short: "ORÇAMENTO"  },
];

function getAddOptions(
  parentType: string | null,
  hasScopeBlock: boolean,
  hasQuoteBlock: boolean,
  kind: CompositorKind,
): typeof ALL_OPTIONS {
  const options =
    kind === "delivery"
      ? ALL_OPTIONS.filter((o) => !isDeliveryCompositorBlockDisabled(o.type, kind))
      : ALL_OPTIONS;
  if (parentType === null) {
    return options.filter((o) => {
      if (o.type === "scope") return !hasScopeBlock;
      if (o.type === "quote") return !hasQuoteBlock;
      return o.type === "session";
    });
  }
  if (parentType === "location") return options.filter((o) => o.type === "section" || o.type === "text");
  return options.filter((o) => o.type !== "section" && o.type !== "scope" && o.type !== "quote");
}

/** Pré-visualização no portal: segue o ponteiro com o offset do clique (simétrico pra cima/baixo). */
function SidebarDragPreview({
  block,
  selectedId,
}: {
  block: BudgetBlock | undefined;
  selectedId: string | null;
}) {
  if (!block) return null;
  const depth = block.depth;
  const indentPx = depth * 12 + 8;
  const isScope = block.type === "scope";
  const isHeaderFooter = block.type === "header_footer";
  const isQuote = block.type === "quote";
  const isSelected = selectedId === block.id;
  const isExpandable = (block.type === "session" || block.type === "location") && !isScope && !isHeaderFooter;

  return (
    <div
      className={cn(
        "pointer-events-none flex min-w-0 w-full cursor-grabbing items-center gap-1 rounded-md border py-1.5 pr-1 text-xs shadow-lg",
        isSelected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground"
      )}
      style={{ paddingLeft: `${indentPx}px` }}
    >
      <GripVertical className="h-3 w-3 shrink-0 opacity-70" />
      {isExpandable ? (
        <span className="shrink-0 opacity-50">
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      ) : (
        <span className={cn("shrink-0", isSelected ? "opacity-80" : "opacity-60")}>
          {BLOCK_ICONS[block.type] ?? <FileText className="h-3.5 w-3.5" />}
        </span>
      )}
      {block.number ? (
        <span className={cn("shrink-0 font-mono text-xs", isSelected ? "opacity-80" : "opacity-70")}>
          {block.number}.
        </span>
      ) : null}
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-xs font-medium leading-none",
          (block.type === "session" || isScope || isHeaderFooter || isQuote || block.type === "toc" || block.type === "figures") && "uppercase"
        )}
      >
        {isScope ? getScopeBlockLabel(block.label) : isHeaderFooter ? "CABEÇALHO E RODAPÉ" : isQuote ? "ORÇAMENTO" : block.type === "toc" ? "SUMÁRIO" : block.type === "figures" || block.type === "databook_figures" ? "LISTA DE FIGURAS" : block.type === "databook_installations" ? "INSTALAÇÕES E PRODUTOS" : block.type === "databook_attachments" ? "APÊNDICES E ANEXOS" : (block.label || `(${block.type})`)}
      </span>
    </div>
  );
}

// ─── InlineAdder — expansível no próprio sidebar ──────────────────────────────
// Aparece ABAIXO do item pai, sem floats ou portais.

interface InlineAdderProps {
  budgetId: string;
  parentId: string | null;
  parentType: string | null;
  depth: number;
  hasScopeBlock?: boolean;
  hasQuoteBlock?: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

function InlineAdder({ budgetId, parentId, parentType, depth, hasScopeBlock = false, hasQuoteBlock = false, onSuccess, onCancel }: InlineAdderProps) {
  const { actions, kind } = useCompositorRuntime();
  const [selectedType, setSelectedType] = useState<BlockType | null>(null);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);

  const options = getAddOptions(parentType, hasScopeBlock, hasQuoteBlock, kind);
  const indentPx = (depth + 1) * 12 + 8;

  const handleCreate = async (overrideType?: BlockType, overrideLabel?: string) => {
    const type = overrideType ?? selectedType;
    const lbl = overrideLabel ?? label.trim();
    if (!type || !lbl) return;
    setLoading(true);
    const result = await actions.addBlockAction({ budgetId, parentId, type, label: lbl });
    setLoading(false);
    if (result.success) {
      onSuccess();
    } else {
      toast.error(result.error || "Erro ao criar");
    }
  };

  const handleTypeSelect = (type: BlockType) => {
    const directCreate: Partial<Record<BlockType, string>> = {
      scope: COMPOSITOR_SCOPE_BLOCK_DEFAULT_LABEL,
      header_footer: "CABEÇALHO E RODAPÉ",
      quote: "ORÇAMENTO",
      session: "Seção",
    };
    if (type in directCreate) {
      handleCreate(type, directCreate[type]!);
    } else {
      setSelectedType(type);
    }
  };

  return (
    <div
      className="bg-muted/40 border-l-2 border-primary/30 py-2 space-y-2"
      style={{ paddingLeft: `${indentPx}px`, paddingRight: "8px" }}
    >
      {/* Seletor de tipo */}
      {!selectedType ? (
        <div className="flex flex-wrap gap-1">
          {options.map((opt) => (
            <button
              key={opt.type}
              onClick={() => handleTypeSelect(opt.type)}
              className="flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted hover:border-primary/50 transition-colors"
            >
              {BLOCK_ICONS[opt.type]}
              {opt.short}
            </button>
          ))}
          <button
            onClick={onCancel}
            className="rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
          >
            ✕
          </button>
        </div>
      ) : (
        /* Input de nome */
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            {BLOCK_ICONS[selectedType]}
            <span>{options.find(o => o.type === selectedType)?.label}</span>
          </p>
          <div className="flex gap-1">
            <Input
              autoFocus
              placeholder="Nome..."
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate(undefined, label.trim());
                if (e.key === "Escape") { setSelectedType(null); setLabel(""); }
              }}
              className="h-7 text-xs"
              disabled={loading}
            />
            <Button size="sm" className="h-7 px-2 text-xs shrink-0" onClick={() => handleCreate(undefined, label.trim())} disabled={!label.trim() || loading}>
              OK
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs shrink-0" onClick={() => { setSelectedType(null); setLabel(""); }}>
              ←
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SortableBlockChildren — SortableContext apenas (DndContext no topo) ──────

interface SortableBlockChildrenProps {
  block: BudgetBlock;
  budgetId: string;
  selectedId: string | null;
  onSelect: (block: BudgetBlock) => void;
  onRefresh: () => void;
  depth: number;
  isReadOnly: boolean;
  autoEditId?: string | null;
  onAutoEdit?: () => void;
  onBlockCreated?: (id: string) => void;
}

function SortableBlockChildren({ block, budgetId, selectedId, onSelect, onRefresh, depth, isReadOnly, autoEditId, onAutoEdit, onBlockCreated }: SortableBlockChildrenProps) {
  const ctx = useContext(CompositorDndCtx);
  const localChildren = ctx?.childrenReg[block.id] ?? block.children;

  return (
    <SortableContext items={localChildren.map((b) => b.id)} strategy={verticalListSortingStrategy}>
      {localChildren.map((child) => (
        <BlockTreeNode
          key={child.id}
          block={child}
          budgetId={budgetId}
          selectedId={selectedId}
          onSelect={onSelect}
          onRefresh={onRefresh}
          depth={depth + 1}
          isReadOnly={isReadOnly}
          autoEditId={autoEditId}
          onAutoEdit={onAutoEdit}
          onBlockCreated={onBlockCreated}
        />
      ))}
    </SortableContext>
  );
}

// ─── BlockTreeNode (recursivo) ────────────────────────────────────────────────

interface BlockTreeNodeProps {
  block: BudgetBlock;
  budgetId: string;
  selectedId: string | null;
  onSelect: (block: BudgetBlock) => void;
  onRefresh: () => void;
  depth: number;
  isReadOnly?: boolean;
  autoEditId?: string | null;
  onAutoEdit?: () => void;
  onBlockCreated?: (id: string) => void;
}

function BlockTreeNode({ block, budgetId, selectedId, onSelect, onRefresh, depth, isReadOnly = false, autoEditId, onAutoEdit, onBlockCreated }: BlockTreeNodeProps) {
  const { actions } = useCompositorRuntime();
  const confirmDialog = useConfirmDialog();
  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addingSubSession, setAddingSubSession] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(block.label || "");
  const labelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingLabel) labelInputRef.current?.select();
  }, [editingLabel]);

  useEffect(() => {
    if (autoEditId && autoEditId === block.id) {
      setLabelDraft(block.label || "");
      setEditingLabel(true);
      onAutoEdit?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEditId, block.id]);

  const commitLabel = async () => {
    setEditingLabel(false);
    const trimmed = labelDraft.trim();
    if (!trimmed || trimmed === block.label) { setLabelDraft(block.label || ""); return; }
    const result = await actions.updateBlockAction(block.id, budgetId, {
      label: normalizeLabel(trimmed, block),
    });
    if (!result.success) { toast.error(result.error || "Erro ao renomear"); setLabelDraft(block.label || ""); }
    else onRefresh();
  };

  const ctx = useContext(CompositorDndCtx);
  const isDragActive = !!(ctx?.activeDragId && ctx.activeDragId !== block.id);

  const isScope = block.type === "scope";
  const isHeaderFooter = block.type === "header_footer";
  const isQuote = block.type === "quote";
  const isCover = block.type === "cover";
  const isToc = block.type === "toc";
  const isFigures = block.type === "figures";
  const isDatabookAutomatic = ["databook_figures", "databook_installations", "databook_attachments"].includes(block.type);
  const isSelected = selectedId === block.id;
  const isExpandable = (block.type === "session" || block.type === "location") && !isScope && !isHeaderFooter && !isQuote;
  const canAdd = (block.type === "session" || block.type === "location") && !isScope && !isHeaderFooter && !isQuote;
  const localChildren = ctx?.childrenReg[block.id] ?? block.children;
  const hasChildren = localChildren.length > 0;
  const indentPx = depth * 12 + 8;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: { parentId: block.parent_id ?? null },
    disabled: isReadOnly,
  });
  // Só transladação (sem scale). Com DragOverlay, o item ativo fica invisível na lista e não recebe translate — o overlay segue o ponteiro com offset correto.
  const tx = transform?.x ?? 0;
  const ty = transform?.y ?? 0;
  const dragStyle: CSSProperties = {
    transform:
      isDragging
        ? undefined
        : tx === 0 && ty === 0
          ? undefined
          : `translate3d(${Math.round(tx)}px, ${Math.round(ty)}px, 0)`,
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0 : 1,
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirmDialog({
      title: "Remover bloco",
      description: `Remover "${block.label || block.type}"? Isso excluirá todos os itens dentro.`,
      confirmLabel: "Remover",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    const result = await actions.deleteBlockAction(block.id, budgetId);
    if (!result.success) {
      toast.error(result.error || "Erro ao remover");
      setDeleting(false);
    } else {
      onRefresh();
    }
  };

  return (
    <div ref={setNodeRef} style={dragStyle} className="w-full min-w-0 max-w-full">
      {/* Linha do nó */}
      <div
        className={cn(
          "group flex min-w-0 w-full items-center gap-1 pr-1 py-1.5 cursor-pointer transition-colors select-none rounded-sm",
          isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
        )}
        style={{ paddingLeft: `${indentPx}px` }}
        onClick={() => onSelect(block)}
      >
        {/* Handle de drag — capa, sumário, lista de figuras e escopo (raiz) reordenam na raiz como os demais */}
        {!isReadOnly ? (
          <div
            {...listeners}
            {...attributes}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-40 hover:!opacity-100 p-0.5 rounded"
          >
            <GripVertical className="h-3 w-3" />
          </div>
        ) : (
          (isCover || isToc || isFigures || isHeaderFooter || isQuote || (isScope && depth === 0)) && (
            <span className="w-5 shrink-0" aria-hidden />
          )
        )}

        {/* Ícone / expand — expandível para session e location */}
        {isExpandable ? (
          <button
            className="shrink-0 opacity-60 hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); setCollapsed((v) => !v); }}
          >
            {!collapsed && hasChildren
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className={cn("shrink-0", isSelected ? "opacity-80" : "opacity-40")}>
            {BLOCK_ICONS[block.type] ?? <FileText className="h-3.5 w-3.5" />}
          </span>
        )}

        {/* Número hierárquico — todos os tipos */}
        {block.number && (
          <span className={cn("shrink-0 text-xs font-mono", isSelected ? "opacity-80" : "opacity-40")}>
            {block.number}.
          </span>
        )}

        {/* Label — duplo-clique para editar */}
        {editingLabel && !isReadOnly && !isHeaderFooter && !isQuote && !isCover && !isToc && !isFigures && !isDatabookAutomatic ? (
          <input
            ref={labelInputRef}
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitLabel(); }
              if (e.key === "Escape") { setEditingLabel(false); setLabelDraft(block.label || ""); }
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-transparent border-b border-primary outline-none text-xs font-medium leading-none"
          />
        ) : (
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-xs font-medium leading-none [text-size-adjust:100%]",
              (block.type === "session" || isScope || isHeaderFooter || isQuote || isCover || isToc || isFigures) && "uppercase"
            )}
            onDoubleClick={(e) => {
              if (!isReadOnly && !isHeaderFooter && !isQuote && !isCover && !isToc && !isFigures && !isDatabookAutomatic) {
                e.stopPropagation();
                setLabelDraft(
                  isScope ? getScopeBlockLabel(block.label) : (block.label || ""),
                );
                setEditingLabel(true);
              }
            }}
          >
            {isScope ? getScopeBlockLabel(block.label) : isHeaderFooter ? "CABEÇALHO E RODAPÉ" : isQuote ? "ORÇAMENTO" : isCover ? "CAPA" : isToc ? "SUMÁRIO" : isFigures || block.type === "databook_figures" ? "LISTA DE FIGURAS" : block.type === "databook_installations" ? "INSTALAÇÕES E PRODUTOS" : block.type === "databook_attachments" ? "APÊNDICES E ANEXOS" : (block.label || `(${block.type})`)}
          </span>
        )}

        {/* Botão [+] — em session: adiciona subseção direto; em location: abre submenu */}
        {canAdd && !isReadOnly && (
          <button
            disabled={addingSubSession}
            onClick={async (e) => {
              e.stopPropagation();
              if (block.type === "session") {
                setAddingSubSession(true);
                const result = await actions.addBlockAction({ budgetId, parentId: block.id, type: "session", label: "Seção" });
                setAddingSubSession(false);
                if (result.success) {
                  if (result.blockId) onBlockCreated?.(result.blockId);
                  setCollapsed(false);
                  onRefresh();
                } else {
                  toast.error(result.error || "Erro ao criar seção");
                }
              } else {
                setAdding((v) => !v);
              }
            }}
            className={cn(
              "shrink-0 rounded p-0.5 transition-all opacity-0 group-hover:opacity-100",
              adding
                ? "opacity-100 bg-primary-foreground/20 text-primary-foreground"
                : isSelected
                  ? "text-primary-foreground hover:bg-primary-foreground/20"
                  : "text-muted-foreground hover:text-primary hover:bg-muted"
            )}
            title={block.type === "location" ? "Adicionar trecho ou texto" : "Adicionar subseção"}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Botão excluir — oculto em isReadOnly e scope */}
        {!isReadOnly && !isScope && !isHeaderFooter && !isQuote && !isCover && !isToc && !isFigures && !isDatabookAutomatic && (
          <button
            disabled={deleting}
            onClick={handleDelete}
            className={cn(
              "shrink-0 rounded p-0.5 transition-all opacity-0 group-hover:opacity-60 hover:!opacity-100",
              isSelected
                ? "text-primary-foreground hover:bg-primary-foreground/20"
                : "text-muted-foreground hover:text-destructive"
            )}
            title="Excluir"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* InlineAdder: aparece abaixo do nó pai, antes dos filhos */}
      {adding && (
        <InlineAdder
          budgetId={budgetId}
          parentId={block.id}
          parentType={block.type}
          depth={depth}
          onSuccess={() => { setAdding(false); onRefresh(); }}
          onCancel={() => setAdding(false)}
        />
      )}

      {/* Filhos */}
      {!collapsed && hasChildren && (
        <SortableBlockChildren
          block={block}
          budgetId={budgetId}
          selectedId={selectedId}
          onSelect={onSelect}
          onRefresh={onRefresh}
          depth={depth}
          isReadOnly={isReadOnly}
          autoEditId={autoEditId}
          onAutoEdit={onAutoEdit}
          onBlockCreated={onBlockCreated}
        />
      )}

      {/* Zona de drop: arrastar seção para dentro desta seção */}
      {block.type === "session" && !isScope && !isReadOnly && isDragActive && (
        <DroppableSessionInto blockId={block.id} depth={depth} />
      )}
    </div>
  );
}

// ─── CompositorSidebar ────────────────────────────────────────────────────────

interface CompositorSidebarProps {
  roots: BudgetBlock[];
  budgetId: string;
  compositorLabel: string;
  onCompositorLabelChange?: (label: string) => void | Promise<void>;
  selectedId: string | null;
  onSelect: (block: BudgetBlock) => void;
  onRefresh: () => void;
  isReadOnly?: boolean;
}

export function CompositorSidebar({
  roots,
  budgetId,
  compositorLabel,
  onCompositorLabelChange,
  selectedId,
  onSelect,
  onRefresh,
  isReadOnly = false,
}: CompositorSidebarProps) {
  const { actions } = useCompositorRuntime();
  const [addingRootSession, setAddingRootSession] = useState(false);
  const [autoEditId, setAutoEditId] = useState<string | null>(null);
  const [childrenReg, setChildrenReg] = useState<ChildrenReg>(() => buildChildrenReg(roots));
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [editingCompositorTitle, setEditingCompositorTitle] = useState(false);
  const [compositorTitleDraft, setCompositorTitleDraft] = useState(compositorLabel);
  const compositorTitleInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setChildrenReg(buildChildrenReg(roots)); }, [roots]);

  useEffect(() => {
    if (!editingCompositorTitle) setCompositorTitleDraft(compositorLabel);
  }, [compositorLabel, editingCompositorTitle]);

  useEffect(() => {
    if (editingCompositorTitle) compositorTitleInputRef.current?.select();
  }, [editingCompositorTitle]);

  const commitCompositorTitle = async () => {
    setEditingCompositorTitle(false);
    const trimmed = compositorTitleDraft.trim();
    if (!trimmed || trimmed === compositorLabel) {
      setCompositorTitleDraft(compositorLabel);
      return;
    }
    await onCompositorLabelChange?.(trimmed);
  };

  const localRoots = childrenReg[ROOT_KEY] ?? [];

  const collisionDetection = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const b of flattenTree(roots)) {
      map.set(b.id, b.parent_id ?? null);
    }
    return createCompositorTreeCollisionDetection(map);
  }, [roots]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const overId = String(over.id);

    const activeBlock = flattenTree(roots).find((b) => b.id === String(active.id));

    // Drop dentro de uma seção (zona "into:")
    if (overId.startsWith("into:")) {
      if (
        activeBlock?.type === "cover" ||
        activeBlock?.type === "toc" ||
        activeBlock?.type === "figures" ||
        activeBlock?.type === "header_footer" ||
        activeBlock?.type === "quote" ||
        activeBlock?.type === "terms" ||
        activeBlock?.type === "scope"
      ) {
        toast.error("Detalhamento do projeto, cabeçalho/rodapé, orçamento, condições gerais, capa, sumário e lista de figuras só podem ficar na raiz do documento.");
        return;
      }
      const targetParentId = overId.slice(5);
      // Não permite dropar dentro do scope
      const targetBlock = flattenTree(roots).find((b) => b.id === targetParentId);
      if (targetBlock?.type === "scope") return;

      actions.moveBlockToParentAction(String(active.id), targetParentId, budgetId)
        .then((r) => {
          if (r.success) onRefresh();
          else { toast.error(r.error || "Erro ao mover seção"); onRefresh(); }
        })
        .catch(() => { toast.error("Erro ao mover seção"); onRefresh(); });
      return;
    }

    const activeParentId: string | null = (active.data.current?.parentId as string | null) ?? null;
    const overParentId: string | null = (over.data.current?.parentId as string | null) ?? null;

    if (
      (activeBlock?.type === "scope" ||
        activeBlock?.type === "header_footer" ||
        activeBlock?.type === "quote" ||
        activeBlock?.type === "terms" ||
        activeBlock?.type === "cover" ||
        activeBlock?.type === "toc" ||
        activeBlock?.type === "figures") &&
      overParentId !== null
    ) {
      toast.error("Detalhamento do projeto, cabeçalho/rodapé, orçamento, condições gerais, capa, sumário e lista de figuras só podem ser reordenados na raiz.");
      return;
    }

    if (activeParentId === overParentId) {
      // Reordenar dentro do mesmo pai
      const key = pKey(activeParentId);
      const siblings = childrenReg[key] ?? [];
      const oldIdx = siblings.findIndex((b) => b.id === String(active.id));
      const newIdx = siblings.findIndex((b) => b.id === String(over.id));
      if (oldIdx === -1 || newIdx === -1) return;
      const reordered = arrayMove(siblings, oldIdx, newIdx);
      setChildrenReg((prev) => ({ ...prev, [key]: reordered }));
      actions.reorderBlocksAction(reordered.map((b) => b.id), budgetId)
        .then((r) => { if (!r.success) onRefresh(); })
        .catch(() => onRefresh());
    } else {
      // Mover como irmão em outro pai (cross-parent)
      actions.moveBlockToParentAction(String(active.id), overParentId, budgetId)
        .then((r) => {
          if (r.success) onRefresh();
          else { toast.error(r.error || "Erro ao mover seção"); onRefresh(); }
        })
        .catch(() => { toast.error("Erro ao mover seção"); onRefresh(); });
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const overlayBlock = useMemo(() => {
    if (!activeDragId) return undefined;
    return flattenTree(roots).find((b) => b.id === activeDragId);
  }, [activeDragId, roots]);

  return (
    <CompositorDndCtx.Provider value={{ childrenReg, activeDragId }}>
      <div className="w-64 shrink-0 flex flex-col border-r bg-card">
        {/* Cabeçalho */}
        <div className="p-3 border-b border-primary/20 shrink-0 bg-primary/[0.04]">
          {editingCompositorTitle && !isReadOnly && onCompositorLabelChange ? (
            <Input
              ref={compositorTitleInputRef}
              value={compositorTitleDraft}
              onChange={(e) => setCompositorTitleDraft(e.target.value)}
              onBlur={() => void commitCompositorTitle()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitCompositorTitle();
                }
                if (e.key === "Escape") {
                  setEditingCompositorTitle(false);
                  setCompositorTitleDraft(compositorLabel);
                }
              }}
              className="h-7 text-sm font-semibold"
            />
          ) : (
            <h3
              className={cn(
                "text-sm font-semibold text-primary truncate",
                !isReadOnly && onCompositorLabelChange && "cursor-pointer hover:opacity-80"
              )}
              title={
                !isReadOnly && onCompositorLabelChange
                  ? "Duplo clique para editar o nome do Compositor"
                  : undefined
              }
              onDoubleClick={() => {
                if (isReadOnly || !onCompositorLabelChange) return;
                setCompositorTitleDraft(compositorLabel);
                setEditingCompositorTitle(true);
              }}
            >
              {compositorLabel}
            </h3>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">Estrutura do compositor</p>
        </div>

        {/* Árvore */}
        <div
          ref={(el) => {
            compositorTreeScrollStore.el = el;
          }}
          className="flex-1 overflow-y-auto min-h-0"
        >
          <nav className="p-1.5 space-y-0">
            {localRoots.length === 0 && !addingRootSession && (
              <p className="text-xs text-muted-foreground px-2 py-4 text-center">
                Adicione uma seção para começar.
              </p>
            )}
            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetection}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveDragId(null)}
            >
              <CompositorTreeScrollCompensationBridge />
              <SortableContext items={localRoots.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                {localRoots.map((block) => (
                  <BlockTreeNode
                    key={block.id}
                    block={block}
                    budgetId={budgetId}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onRefresh={onRefresh}
                    depth={0}
                    isReadOnly={isReadOnly}
                    autoEditId={autoEditId}
                    onAutoEdit={() => setAutoEditId(null)}
                    onBlockCreated={(id) => setAutoEditId(id)}
                  />
                ))}
              </SortableContext>
              {/*
                Por padrão o DragOverlay usa width/height do activeNodeRect (linha + filhos + zonas "into").
                Isso deixa uma caixa invisível enorme: o cartão fica “embaixo” do cursor. Sobrescrever
                altura/largura para só a linha da pré-visualização.
              */}
              <DragOverlay
                dropAnimation={null}
                modifiers={[compositorOverlayScrollCompensation]}
                style={{
                  width: 244,
                  height: "auto",
                  minHeight: 0,
                  boxSizing: "border-box",
                }}
              >
                {activeDragId ? (
                  <SidebarDragPreview block={overlayBlock} selectedId={selectedId} />
                ) : null}
              </DragOverlay>
            </DndContext>
          </nav>
        </div>

        {/* Rodapé: novos blocos raiz — oculto em isReadOnly */}
        {!isReadOnly && (
          <div className="space-y-1.5 p-2 border-t shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs gap-1.5"
              disabled={addingRootSession}
              onClick={async () => {
                setAddingRootSession(true);
                const result = await actions.addBlockAction({ budgetId, parentId: null, type: "session", label: "Seção" });
                setAddingRootSession(false);
                if (result.success) {
                  if (result.blockId) setAutoEditId(result.blockId);
                  onRefresh();
                } else {
                  toast.error(result.error || "Erro ao criar seção");
                }
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              {addingRootSession ? "Criando..." : "Adicionar Seção"}
            </Button>
          </div>
        )}
      </div>
    </CompositorDndCtx.Provider>
  );
}

"use client";

import { useState, useEffect, useRef, createContext, useContext } from "react";
import { ChevronRight, ChevronDown, MapPin, Layers, FileText, Plus, Trash2, FolderOpen, GripVertical, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { addBlockAction, deleteBlockAction, reorderBlocksAction, updateBlockAction, moveBlockToParentAction } from "@/actions/budget-compositor-actions";
import { toast } from "@/lib/toast";
import type { BudgetBlock, BlockType } from "@/types/budget-compositor-types";
import { flattenTree } from "@/types/budget-compositor-types";
import {
  DndContext,
  closestCenter,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── Children registry context ────────────────────────────────────────────────
// Usa Record<string, BudgetBlock[]> onde null parent usa a chave "__root__"

const ROOT_KEY = "__root__";
function pKey(id: string | null): string { return id ?? ROOT_KEY; }
type ChildrenReg = Record<string, BudgetBlock[]>;

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

// ─── DroppableSessionInto ─────────────────────────────────────────────────────
// Zona de drop dentro de uma sessão (para soltar como filho)

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
          ? <><Plus className="h-3 w-3 shrink-0" /><span>Soltar dentro desta sessão</span></>
          : <span>Arrastar sessão aqui</span>
        }
      </div>
    </div>
  );
}

// ─── Ícones e opções ──────────────────────────────────────────────────────────

const BLOCK_ICONS: Record<string, React.ReactNode> = {
  session:  <FolderOpen className="h-3.5 w-3.5 shrink-0" />,
  location: <MapPin className="h-3.5 w-3.5 shrink-0" />,
  section:  <Layers className="h-3.5 w-3.5 shrink-0" />,
  text:     <FileText className="h-3.5 w-3.5 shrink-0" />,
  scope:    <Map className="h-3.5 w-3.5 shrink-0 text-primary" />,
};

// Opções disponíveis por tipo de pai
// session → pode conter sub-sessões, locais, texto (mas NÃO trecho direto)
// location → pode conter trechos e texto (mas NÃO sessão ou local)
// null (raiz) → sessão + escopo
const ALL_OPTIONS: { type: BlockType; label: string; short: string }[] = [
  { type: "session",  label: "Sub-sessão",      short: "Sessão"  },
  { type: "location", label: "Local (ambiente)", short: "Local"   },
  { type: "section",  label: "Trecho",           short: "Trecho"  },
  { type: "text",     label: "Texto livre",      short: "Texto"   },
  { type: "scope",    label: "Bloco Escopo",     short: "ESCOPO"  },
];

function getAddOptions(parentType: string | null, hasScopeBlock: boolean): typeof ALL_OPTIONS {
  if (parentType === null) {
    return ALL_OPTIONS.filter((o) => {
      if (o.type === "scope") return !hasScopeBlock; // só se ainda não existe
      return o.type === "session";
    });
  }
  if (parentType === "location") return ALL_OPTIONS.filter((o) => o.type === "section" || o.type === "text");
  // session (e qualquer outro contêiner futuro): session, location, text
  return ALL_OPTIONS.filter((o) => o.type !== "section" && o.type !== "scope");
}

// ─── InlineAdder — expansível no próprio sidebar ──────────────────────────────
// Aparece ABAIXO do item pai, sem floats ou portais.

interface InlineAdderProps {
  budgetId: string;
  parentId: string | null;
  parentType: string | null;
  depth: number;
  hasScopeBlock?: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

function InlineAdder({ budgetId, parentId, parentType, depth, hasScopeBlock = false, onSuccess, onCancel }: InlineAdderProps) {
  const [selectedType, setSelectedType] = useState<BlockType | null>(null);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);

  const options = getAddOptions(parentType, hasScopeBlock);
  const indentPx = (depth + 1) * 12 + 8;

  const handleCreate = async (overrideType?: BlockType, overrideLabel?: string) => {
    const type = overrideType ?? selectedType;
    const lbl = overrideLabel ?? label.trim();
    if (!type || !lbl) return;
    setLoading(true);
    const result = await addBlockAction({ budgetId, parentId, type, label: lbl });
    setLoading(false);
    if (result.success) {
      onSuccess();
    } else {
      toast.error(result.error || "Erro ao criar");
    }
  };

  const handleTypeSelect = (type: BlockType) => {
    const directCreate: Partial<Record<BlockType, string>> = {
      scope: "ESCOPO",
      session: "Sessão",
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
    const result = await updateBlockAction(block.id, budgetId, { label: trimmed });
    if (!result.success) { toast.error(result.error || "Erro ao renomear"); setLabelDraft(block.label || ""); }
    else onRefresh();
  };

  const ctx = useContext(CompositorDndCtx);
  const isDragActive = !!(ctx?.activeDragId && ctx.activeDragId !== block.id);

  const isScope = block.type === "scope";
  const isSelected = selectedId === block.id;
  const isExpandable = (block.type === "session" || block.type === "location") && !isScope;
  const canAdd = (block.type === "session" || block.type === "location") && !isScope;
  const localChildren = ctx?.childrenReg[block.id] ?? block.children;
  const hasChildren = localChildren.length > 0;
  const indentPx = depth * 12 + 8;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: { parentId: block.parent_id ?? null },
    // Scope é fixo — não pode ser arrastado
    disabled: isScope,
  });
  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Remover "${block.label || block.type}"? Isso excluirá todos os itens dentro.`)) return;
    setDeleting(true);
    const result = await deleteBlockAction(block.id, budgetId);
    if (!result.success) {
      toast.error(result.error || "Erro ao remover");
      setDeleting(false);
    } else {
      onRefresh();
    }
  };

  return (
    <div ref={setNodeRef} style={dragStyle}>
      {/* Linha do nó */}
      <div
        className={cn(
          "group flex items-center gap-1 pr-1 py-1.5 cursor-pointer transition-colors select-none rounded-sm",
          isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
        )}
        style={{ paddingLeft: `${indentPx}px` }}
        onClick={() => onSelect(block)}
      >
        {/* Handle de drag — oculto em isReadOnly e scope */}
        {!isReadOnly && !isScope && (
          <div
            {...listeners}
            {...attributes}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-40 hover:!opacity-100 p-0.5 rounded"
          >
            <GripVertical className="h-3 w-3" />
          </div>
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

        {/* Label — duplo-clique para editar (exceto scope) */}
        {editingLabel && !isReadOnly && !isScope ? (
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
            className={cn("flex-1 truncate text-xs font-medium leading-none", (block.type === "session" || isScope) && "uppercase")}
            onDoubleClick={(e) => { if (!isReadOnly && !isScope) { e.stopPropagation(); setLabelDraft(block.label || ""); setEditingLabel(true); } }}
          >
            {isScope ? "ESCOPO" : (block.label || `(${block.type})`)}
          </span>
        )}

        {/* Botão [+] — em session: adiciona sub-sessão direto; em location: abre submenu */}
        {canAdd && !isReadOnly && (
          <button
            disabled={addingSubSession}
            onClick={async (e) => {
              e.stopPropagation();
              if (block.type === "session") {
                setAddingSubSession(true);
                const result = await addBlockAction({ budgetId, parentId: block.id, type: "session", label: "Sessão" });
                setAddingSubSession(false);
                if (result.success) {
                  if (result.blockId) onBlockCreated?.(result.blockId);
                  setCollapsed(false);
                  onRefresh();
                } else {
                  toast.error(result.error || "Erro ao criar sessão");
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
            title={block.type === "location" ? "Adicionar trecho ou texto" : "Adicionar sub-sessão"}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Botão excluir — oculto em isReadOnly e scope */}
        {!isReadOnly && !isScope && (
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

      {/* Zona de drop: arrastar sessão para dentro desta sessão */}
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
  selectedId: string | null;
  onSelect: (block: BudgetBlock) => void;
  onRefresh: () => void;
  isReadOnly?: boolean;
}

export function CompositorSidebar({ roots, budgetId, selectedId, onSelect, onRefresh, isReadOnly = false }: CompositorSidebarProps) {
  const [addingRootSession, setAddingRootSession] = useState(false);
  const [autoEditId, setAutoEditId] = useState<string | null>(null);
  const [childrenReg, setChildrenReg] = useState<ChildrenReg>(() => buildChildrenReg(roots));
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setChildrenReg(buildChildrenReg(roots)); }, [roots]);

  const localRoots = childrenReg[ROOT_KEY] ?? [];
  const hasScopeBlock = localRoots.some((b) => b.type === "scope");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const overId = String(over.id);

    // Busca o bloco arrastado para checar se é scope
    const activeBlock = flattenTree(roots).find((b) => b.id === String(active.id));
    if (activeBlock?.type === "scope") return; // scope não pode ser movido

    // Drop dentro de uma sessão (zona "into:")
    if (overId.startsWith("into:")) {
      const targetParentId = overId.slice(5);
      // Não permite dropar dentro do scope
      const targetBlock = flattenTree(roots).find((b) => b.id === targetParentId);
      if (targetBlock?.type === "scope") return;

      moveBlockToParentAction(String(active.id), targetParentId, budgetId)
        .then((r) => {
          if (r.success) onRefresh();
          else { toast.error(r.error || "Erro ao mover sessão"); onRefresh(); }
        })
        .catch(() => { toast.error("Erro ao mover sessão"); onRefresh(); });
      return;
    }

    const activeParentId: string | null = (active.data.current?.parentId as string | null) ?? null;
    const overParentId: string | null = (over.data.current?.parentId as string | null) ?? null;

    if (activeParentId === overParentId) {
      // Reordenar dentro do mesmo pai
      const key = pKey(activeParentId);
      const siblings = childrenReg[key] ?? [];
      const oldIdx = siblings.findIndex((b) => b.id === String(active.id));
      const newIdx = siblings.findIndex((b) => b.id === String(over.id));
      if (oldIdx === -1 || newIdx === -1) return;
      const reordered = arrayMove(siblings, oldIdx, newIdx);
      setChildrenReg((prev) => ({ ...prev, [key]: reordered }));
      reorderBlocksAction(reordered.map((b) => b.id), budgetId)
        .then((r) => { if (!r.success) onRefresh(); })
        .catch(() => onRefresh());
    } else {
      // Mover como irmão em outro pai (cross-parent)
      moveBlockToParentAction(String(active.id), overParentId, budgetId)
        .then((r) => {
          if (r.success) onRefresh();
          else { toast.error(r.error || "Erro ao mover sessão"); onRefresh(); }
        })
        .catch(() => { toast.error("Erro ao mover sessão"); onRefresh(); });
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  return (
    <CompositorDndCtx.Provider value={{ childrenReg, activeDragId }}>
      <div className="w-64 shrink-0 flex flex-col border-r bg-card">
        {/* Cabeçalho */}
        <div className="p-3 border-b border-primary/20 shrink-0 bg-primary/[0.04]">
          <h3 className="text-sm font-semibold text-primary">Compositor</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Estrutura do orçamento</p>
        </div>

        {/* Árvore */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <nav className="p-1.5 space-y-0">
            {localRoots.length === 0 && !addingRootSession && (
              <p className="text-xs text-muted-foreground px-2 py-4 text-center">
                Adicione uma sessão para começar.
              </p>
            )}
            <DndContext
              sensors={sensors}
              collisionDetection={(args) => {
                const ptr = pointerWithin(args);
                const intoHit = ptr.find((c) => String(c.id).startsWith("into:"));
                if (intoHit) return [intoHit];
                return ptr.length ? ptr : closestCenter(args);
              }}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveDragId(null)}
            >
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
            </DndContext>
          </nav>
        </div>

        {/* Rodapé: nova sessão raiz — oculto em isReadOnly */}
        {!isReadOnly && (
          <div className="p-2 border-t shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs gap-1.5"
              disabled={addingRootSession}
              onClick={async () => {
                setAddingRootSession(true);
                const result = await addBlockAction({ budgetId, parentId: null, type: "session", label: "Sessão" });
                setAddingRootSession(false);
                if (result.success) {
                  if (result.blockId) setAutoEditId(result.blockId);
                  onRefresh();
                } else {
                  toast.error(result.error || "Erro ao criar sessão");
                }
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              {addingRootSession ? "Criando..." : "Adicionar Sessão"}
            </Button>
          </div>
        )}
      </div>
    </CompositorDndCtx.Provider>
  );
}

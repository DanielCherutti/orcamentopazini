"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  FileText,
  Heading2,
  Image as ImageIcon,
  LayoutTemplate,
  ListOrdered,
  Map as MapIcon,
  Plus,
  ReceiptText,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompositorRichTextEditor } from "@/components/budgets/compositor/compositor-rich-text-editor";
import { HeaderFooterLayoutEditor } from "@/components/budgets/compositor/header-footer-layout-editor";
import { DocumentMarginControls } from "@/components/budgets/compositor/document-margin-controls";
import {
  DEFAULT_COVER_PROPS,
  DEFAULT_HEADER_FOOTER_PROPS,
  type CoverBlockProps,
  type HeaderFooterBlockProps,
} from "@/types/budget-compositor-types";
import {
  createModelTemplateStructure,
  defaultBlockLabel,
  type ModelTemplateBlock,
  type ModelTemplateBlockType,
  type ModelTemplateStructure,
} from "@/lib/model-template-structure";
import { cn } from "@/lib/utils";
import type { ModeloTipo } from "@/actions/model-actions";
import {
  migrateHeaderFooterLayoutsForScopeMode,
  resolveHeaderFooterScopeMode,
  type HeaderFooterLayoutScope,
} from "@/lib/compositor/header-footer-layout";

export function ModelTemplateEditor({
  tipo,
  structure,
  onChange,
}: {
  tipo: ModeloTipo;
  structure: ModelTemplateStructure;
  onChange: (structure: ModelTemplateStructure) => void;
}) {
  if ((tipo === "cabecalho" || tipo === "rodape") && structure.kind === "header_footer") {
    return (
      <HeaderFooterModelEditor
        tipo={tipo}
        structure={structure}
        onChange={onChange}
      />
    );
  }
  if (tipo === "capa" && structure.kind === "cover") {
    return <CoverModelEditor structure={structure} onChange={onChange} />;
  }
  if ((tipo === "orcamento_completo" || tipo === "databook_completo") && structure.kind === "budget") {
    return <BudgetModelEditor structure={structure} onChange={onChange} />;
  }

  const reset = createModelTemplateStructure(tipo);
  return (
    <div className="grid min-h-[520px] place-items-center bg-muted/20 p-8">
      <div className="max-w-sm text-center">
        <LayoutTemplate className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <h3 className="font-semibold">Estrutura incompatível</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Reinicie o conteúdo visual para editar este tipo de modelo.
        </p>
        <Button className="mt-4" onClick={() => onChange(reset)}>
          Reiniciar estrutura
        </Button>
      </div>
    </div>
  );
}

function HeaderFooterModelEditor({
  tipo,
  structure,
  onChange,
}: {
  tipo: "cabecalho" | "rodape";
  structure: Extract<ModelTemplateStructure, { kind: "header_footer" }>;
  onChange: (structure: ModelTemplateStructure) => void;
}) {
  const region = tipo === "cabecalho" ? "header" : "footer";
  const height = tipo === "cabecalho"
    ? Math.max(structure.props.cover_header_height ?? 96, structure.props.inner_header_height ?? 96)
    : Math.max(structure.props.cover_footer_height ?? 48, structure.props.inner_footer_height ?? 40);

  const patch = (next: Partial<HeaderFooterBlockProps>) => {
    onChange({
      ...structure,
      props: { ...structure.props, ...next },
    });
  };

  return (
    <div className="space-y-4 p-4 lg:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">
            Área visual do {tipo === "cabecalho" ? "cabeçalho" : "rodapé"}
          </h3>
          <p className="text-xs text-muted-foreground">
            Arraste os elementos na folha e ajuste propriedades, camadas e variáveis no painel lateral.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Altura
          <Input
            type="number"
            min={24}
            max={240}
            className="h-8 w-20"
            value={height}
            onChange={(event) => {
              const value = Math.max(24, Math.min(240, Number(event.target.value) || 24));
              patch(
                region === "header"
                  ? { cover_header_height: value, inner_header_height: value }
                  : { cover_footer_height: value, inner_footer_height: value },
              );
            }}
          />
        </label>
      </div>
      <DocumentMarginControls props={structure.props} onPatch={patch} />
      <HeaderFooterLayoutEditor
        scope="all"
        region={region}
        props={structure.props}
        height={height}
        onPatch={patch}
      />
    </div>
  );
}

function CoverModelEditor({
  structure,
  onChange,
}: {
  structure: Extract<ModelTemplateStructure, { kind: "cover" }>;
  onChange: (structure: ModelTemplateStructure) => void;
}) {
  const patch = (next: Partial<CoverBlockProps>) => {
    onChange({ ...structure, props: { ...structure.props, ...next } });
  };

  return (
    <div className="min-h-[680px] bg-neutral-200/70 p-4 lg:p-6">
      <div className="mx-auto max-w-[980px] overflow-hidden rounded-md border bg-background shadow-sm">
        <CompositorRichTextEditor
          variant="word"
          value={structure.props.cover_document_html ?? ""}
          onChange={(cover_document_html) => patch({ cover_document_html })}
          wordPageWatermarkUrl={structure.props.cover_watermark_url?.trim() || undefined}
          wordPageWatermarkOpacity={structure.props.cover_watermark_opacity ?? 0.12}
          wordPageBottomLeftText="{{orcamento.codigo}}"
        />
      </div>
    </div>
  );
}

function BudgetModelEditor({
  structure,
  onChange,
}: {
  structure: Extract<ModelTemplateStructure, { kind: "budget" }>;
  onChange: (structure: ModelTemplateStructure) => void;
}) {
  const sortedBlocks = useMemo(
    () => orderTemplateBlocks(structure.blocks),
    [structure.blocks],
  );
  const blockDepths = useMemo(() => templateBlockDepths(structure.blocks), [structure.blocks]);
  const [selectedId, setSelectedId] = useState<string | null>(sortedBlocks[0]?.id ?? null);
  const effectiveSelectedId = structure.blocks.some((block) => block.id === selectedId)
    ? selectedId
    : structure.blocks[0]?.id ?? null;
  const selected = structure.blocks.find((block) => block.id === effectiveSelectedId) ?? null;

  const updateBlocks = (blocks: ModelTemplateBlock[]) => onChange({ ...structure, blocks });
  const updateBlock = (id: string, patch: Partial<ModelTemplateBlock>) => {
    updateBlocks(structure.blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)));
  };
  const updateBlockProps = (id: string, patch: Record<string, unknown>) => {
    updateBlocks(
      structure.blocks.map((block) =>
        block.id === id ? { ...block, props: { ...block.props, ...patch } } : block,
      ),
    );
  };

  const addSection = (asSubsection: boolean) => {
    const parent = asSubsection && selected?.type === "session" ? selected.id : null;
    const siblings = structure.blocks.filter((block) => block.parent_id === parent);
    const id = createLocalId(asSubsection ? "subsecao" : "secao");
    const block: ModelTemplateBlock = {
      id,
      parent_id: parent,
      type: "session",
      label: asSubsection ? "NOVA SUBSEÇÃO" : defaultBlockLabel("session"),
      order_index: siblings.length,
      props: { description: "", page_break_before: false },
    };
    updateBlocks([...structure.blocks, block]);
    setSelectedId(id);
  };

  const removeSelected = () => {
    if (!selected || !["session", "text"].includes(selected.type)) return;
    const ids = new Set([selected.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const block of structure.blocks) {
        if (block.parent_id && ids.has(block.parent_id) && !ids.has(block.id)) {
          ids.add(block.id);
          changed = true;
        }
      }
    }
    const next = structure.blocks.filter((block) => !ids.has(block.id));
    updateBlocks(next);
    setSelectedId(next[0]?.id ?? null);
  };

  const moveSelected = (direction: -1 | 1) => {
    if (!selected) return;
    const siblings = structure.blocks
      .filter((block) => block.parent_id === selected.parent_id)
      .sort((a, b) => a.order_index - b.order_index);
    const currentIndex = siblings.findIndex((block) => block.id === selected.id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;
    const target = siblings[targetIndex]!;
    if (isFixedModelBlock(target.type)) return;
    updateBlocks(
      structure.blocks.map((block) => {
        if (block.id === selected.id) return { ...block, order_index: target.order_index };
        if (block.id === target.id) return { ...block, order_index: selected.order_index };
        return block;
      }),
    );
  };
  const canMoveSelected = (direction: -1 | 1) => {
    if (!selected || isFixedModelBlock(selected.type)) return false;
    const siblings = structure.blocks
      .filter((block) => block.parent_id === selected.parent_id)
      .sort((a, b) => a.order_index - b.order_index);
    const currentIndex = siblings.findIndex((block) => block.id === selected.id);
    const target = siblings[currentIndex + direction];
    return Boolean(target && !isFixedModelBlock(target.type));
  };

  return (
    <div className="grid min-h-[720px] lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="border-b bg-muted/20 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-1 border-b p-2">
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs" onClick={() => addSection(false)}>
            <Plus className="h-3.5 w-3.5" /> Seção
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 px-2 text-xs"
            disabled={selected?.type !== "session"}
            title={selected?.type === "session" ? "Adicionar dentro da seção selecionada" : "Selecione uma seção"}
            onClick={() => addSection(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Subseção
          </Button>
        </div>
        <div className="space-y-1 p-2">
          {sortedBlocks.map((block) => (
            <button
              key={block.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition",
                effectiveSelectedId === block.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground hover:bg-muted",
              )}
              style={{ paddingLeft: 8 + (blockDepths.get(block.id) ?? 0) * 16 }}
              onClick={() => setSelectedId(block.id)}
            >
              <BlockIcon type={block.type} />
              <span className="min-w-0 flex-1 truncate font-medium">{block.label}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="min-w-0 bg-background">
        {selected ? (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/10 px-4 py-2.5">
              <Input
                className="h-8 min-w-48 max-w-md text-sm font-medium"
                value={selected.label}
                disabled={["cover", "header_footer", "figures", "toc", "quote"].includes(selected.type)}
                onChange={(event) => updateBlock(selected.id, { label: event.target.value })}
              />
              <div className="ml-auto flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" title="Mover para cima" disabled={!canMoveSelected(-1)} onClick={() => moveSelected(-1)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" title="Mover para baixo" disabled={!canMoveSelected(1)} onClick={() => moveSelected(1)}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                {["session", "text"].includes(selected.type) ? (
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" title="Excluir bloco" onClick={removeSelected}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>
            <BudgetBlockEditor block={selected} onPatch={(patch) => updateBlockProps(selected.id, patch)} />
          </>
        ) : (
          <div className="grid min-h-[600px] place-items-center text-sm text-muted-foreground">
            Adicione ou selecione um bloco.
          </div>
        )}
      </section>
    </div>
  );
}

function BudgetBlockEditor({
  block,
  onPatch,
}: {
  block: ModelTemplateBlock;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const [band, setBand] = useState<"header" | "footer">("header");
  const [pageScope, setPageScope] = useState<HeaderFooterLayoutScope>("all");

  if (block.type === "cover") {
    const props = { ...DEFAULT_COVER_PROPS, ...block.props } as CoverBlockProps;
    return (
      <div className="min-h-[650px] bg-neutral-200/70 p-4">
        <div className="mx-auto max-w-[900px] overflow-hidden rounded-md border bg-background shadow-sm">
          <CompositorRichTextEditor
            variant="word"
            value={props.cover_document_html ?? ""}
            onChange={(value) => onPatch({ cover_document_html: value })}
            wordPageBottomLeftText="{{orcamento.codigo}}"
          />
        </div>
      </div>
    );
  }

  if (block.type === "header_footer") {
    const props = { ...DEFAULT_HEADER_FOOTER_PROPS, ...block.props } as HeaderFooterBlockProps;
    const scopeMode = resolveHeaderFooterScopeMode(props);
    const effectiveScope = scopeMode === "all" ? "all" : pageScope === "all" ? "cover" : pageScope;
    const height = band === "header"
      ? effectiveScope === "cover"
        ? props.cover_header_height ?? 96
        : effectiveScope === "inner"
          ? props.inner_header_height ?? 96
          : Math.max(props.cover_header_height ?? 96, props.inner_header_height ?? 96)
      : effectiveScope === "cover"
        ? props.cover_footer_height ?? 48
        : effectiveScope === "inner"
          ? props.inner_footer_height ?? 40
          : Math.max(props.cover_footer_height ?? 48, props.inner_footer_height ?? 40);
    return (
      <div className="space-y-4 p-4 lg:p-5">
        <Tabs value={band} onValueChange={(value) => setBand(value as "header" | "footer")}>
          <TabsList>
            <TabsTrigger value="header">Cabeçalho</TabsTrigger>
            <TabsTrigger value="footer">Rodapé</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-3">
          <Button
            type="button"
            size="sm"
            variant={scopeMode === "all" ? "default" : "outline"}
            onClick={() => onPatch(migrateHeaderFooterLayoutsForScopeMode(props, "all") as Record<string, unknown>)}
          >
            Todas as páginas iguais
          </Button>
          <Button
            type="button"
            size="sm"
            variant={scopeMode === "separate" ? "default" : "outline"}
            onClick={() => {
              onPatch(migrateHeaderFooterLayoutsForScopeMode(props, "separate") as Record<string, unknown>);
              setPageScope("cover");
            }}
          >
            Separar capa e páginas internas
          </Button>
          {scopeMode === "separate" ? (
            <Tabs value={effectiveScope} onValueChange={(value) => setPageScope(value as "cover" | "inner")}>
              <TabsList>
                <TabsTrigger value="cover">Capa</TabsTrigger>
                <TabsTrigger value="inner">Páginas internas</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}
        </div>
        <div className="flex items-center gap-2 rounded-md border bg-background p-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Altura do {band === "header" ? "cabeçalho" : "rodapé"}
            <Input
              type="number"
              min={24}
              max={240}
              className="h-8 w-20"
              value={height}
              onChange={(event) => {
                const value = Math.max(24, Math.min(240, Number(event.target.value) || 24));
                onPatch(band === "header"
                  ? effectiveScope === "cover"
                    ? { cover_header_height: value }
                    : effectiveScope === "inner"
                      ? { inner_header_height: value }
                      : { cover_header_height: value, inner_header_height: value }
                  : effectiveScope === "cover"
                    ? { cover_footer_height: value }
                    : effectiveScope === "inner"
                      ? { inner_footer_height: value }
                      : { cover_footer_height: value, inner_footer_height: value });
              }}
            />
          </label>
        </div>
        <DocumentMarginControls props={props} onPatch={(patch) => onPatch(patch as Record<string, unknown>)} />
        <HeaderFooterLayoutEditor
          scope={effectiveScope}
          region={band}
          props={props}
          height={height}
          onPatch={(patch) => onPatch(patch as Record<string, unknown>)}
        />
      </div>
    );
  }

  if (block.type === "quote") {
    return (
      <div className="grid min-h-[560px] place-items-center p-8">
        <div className="w-full max-w-2xl rounded-md border bg-muted/15 p-8 text-center">
          <ReceiptText className="mx-auto h-9 w-9 text-primary" />
          <h3 className="mt-4 font-semibold">Bloco de orçamento</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Produtos, quantidades, valores e totais serão preenchidos com os dados do orçamento no momento da importação.
          </p>
        </div>
      </div>
    );
  }

  if (block.type === "figures" || block.type === "toc" || block.type === "scope") {
    const isScope = block.type === "scope";
    return (
      <div className="grid min-h-[560px] place-items-center p-8">
        <div className="w-full max-w-2xl rounded-md border bg-muted/15 p-8 text-center">
          {block.type === "figures" ? (
            <ImageIcon className="mx-auto h-9 w-9 text-primary" />
          ) : block.type === "toc" ? (
            <ListOrdered className="mx-auto h-9 w-9 text-primary" />
          ) : (
            <MapIcon className="mx-auto h-9 w-9 text-primary" />
          )}
          <h3 className="mt-4 font-semibold">{block.label}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {isScope
              ? "As adequações, locais, trechos, fotos e produtos do orçamento serão inseridos nesta posição. Use as setas para definir onde o detalhamento aparecerá."
              : "Bloco automático gerado a partir da estrutura e das figuras do orçamento."}
          </p>
        </div>
      </div>
    );
  }

  const field = block.type === "session" ? "description" : "content";
  return (
    <div className="min-h-[560px] p-4 lg:p-6">
      {block.type === "session" ? (
        <label className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={block.props.page_break_before !== false}
            onChange={(event) => onPatch({ page_break_before: event.target.checked })}
          />
          Iniciar esta seção em uma nova página
        </label>
      ) : null}
      <CompositorRichTextEditor
        value={String(block.props[field] ?? "")}
        onChange={(value) => onPatch({ [field]: value })}
        placeholder={block.type === "session" ? "Descrição opcional da seção..." : "Digite o conteúdo deste bloco..."}
      />
    </div>
  );
}

function BlockIcon({ type }: { type: ModelTemplateBlockType }) {
  if (type === "cover") return <ImageIcon className="h-3.5 w-3.5 shrink-0" />;
  if (type === "header_footer") return <LayoutTemplate className="h-3.5 w-3.5 shrink-0" />;
  if (type === "figures") return <ImageIcon className="h-3.5 w-3.5 shrink-0" />;
  if (type === "toc") return <ListOrdered className="h-3.5 w-3.5 shrink-0" />;
  if (type === "scope") return <MapIcon className="h-3.5 w-3.5 shrink-0" />;
  if (type === "quote") return <ReceiptText className="h-3.5 w-3.5 shrink-0" />;
  if (type === "session") return <Heading2 className="h-3.5 w-3.5 shrink-0" />;
  return <FileText className="h-3.5 w-3.5 shrink-0" />;
}

function createLocalId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isFixedModelBlock(type: ModelTemplateBlockType): boolean {
  return ["cover", "header_footer", "figures", "toc"].includes(type);
}

function orderTemplateBlocks(blocks: ModelTemplateBlock[]): ModelTemplateBlock[] {
  const result: ModelTemplateBlock[] = [];
  const visit = (parentId: string | null) => {
    blocks
      .filter((block) => block.parent_id === parentId)
      .sort((a, b) => a.order_index - b.order_index)
      .forEach((block) => {
        result.push(block);
        visit(block.id);
      });
  };
  visit(null);
  return result;
}

function templateBlockDepths(blocks: ModelTemplateBlock[]): Map<string, number> {
  const depths = new Map<string, number>();
  const visit = (parentId: string | null, depth: number) => {
    for (const block of blocks.filter((candidate) => candidate.parent_id === parentId)) {
      depths.set(block.id, depth);
      visit(block.id, depth + 1);
    }
  };
  visit(null, 0);
  return depths;
}

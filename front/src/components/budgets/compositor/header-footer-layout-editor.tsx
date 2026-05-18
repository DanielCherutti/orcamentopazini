"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  BringToFront,
  Columns3,
  Copy,
  Hash,
  ImagePlus,
  Layers,
  SendToBack,
  Square,
  Trash2,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type {
  HeaderFooterBlockProps,
  HeaderFooterCanvasElement,
  HeaderFooterCanvasLayout,
  HeaderFooterPageNumberingConfig,
  HeaderFooterTextAlign,
} from "@/types/budget-compositor-types";
import {
  createHeaderFooterElement,
  DEFAULT_PAGE_NUMBERING,
  formatGeneratedPageNumber,
  headerFooterLayoutField,
  normalizeHeaderFooterLayout,
  normalizePageNumbering,
  type HeaderFooterLayoutRegion,
  type HeaderFooterLayoutScope,
} from "@/lib/compositor/header-footer-layout";

const PAGE_BASELINE_PX = 1122;

interface HeaderFooterLayoutEditorProps {
  scope: HeaderFooterLayoutScope;
  region: HeaderFooterLayoutRegion;
  props: HeaderFooterBlockProps;
  height: number;
  readOnly?: boolean;
  onPatch: (patch: Partial<HeaderFooterBlockProps>) => void | Promise<void>;
}

export function HeaderFooterLayoutEditor({
  scope,
  region,
  props,
  height,
  readOnly,
  onPatch,
}: HeaderFooterLayoutEditorProps) {
  const field = headerFooterLayoutField(scope, region);
  const sourceLayout = props[field];
  const sourcePageNumbering = props.page_numbering;
  const initialLayout = useMemo(
    () => normalizeHeaderFooterLayout(sourceLayout),
    [sourceLayout],
  );
  const [layout, setLayout] = useState<HeaderFooterCanvasLayout>(initialLayout);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialLayout.elements[0]?.id ?? null,
  );
  const [pageNumberingDraft, setPageNumberingDraft] = useState<Required<HeaderFooterPageNumberingConfig>>(
    normalizePageNumbering(props.page_numbering),
  );
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bandRef = useRef<HTMLDivElement | null>(null);
  const pageNumbering = pageNumberingDraft;

  useEffect(() => {
    const next = normalizeHeaderFooterLayout(sourceLayout);
    setLayout(next);
    setSelectedId(next.elements[0]?.id ?? null);
    setPageNumberingDraft(normalizePageNumbering(sourcePageNumbering));
  }, [field, sourceLayout, sourcePageNumbering]);

  const selected = layout.elements.find((el) => el.id === selectedId) ?? null;
  const sortedElements = [...layout.elements].sort((a, b) => a.z_index - b.z_index);
  const layerList = [...layout.elements].sort((a, b) => b.z_index - a.z_index);

  const commitLayout = (next: HeaderFooterCanvasLayout) => {
    setLayout(next);
    void onPatch({
      [field]: next,
      ...visibilityPatchFor(scope, region, next.elements.length > 0),
    } as Partial<HeaderFooterBlockProps>);
  };

  const updateElement = (
    id: string,
    patch: Partial<HeaderFooterCanvasElement>,
    options?: { commit?: boolean },
  ) => {
    const next = {
      version: 1 as const,
      elements: layout.elements.map((el) =>
        el.id === id ? normalizeElementBounds({ ...el, ...patch }) : el,
      ),
    };
    setLayout(next);
    if (options?.commit !== false) {
      void onPatch({ [field]: next } as Partial<HeaderFooterBlockProps>);
    }
  };

  const addElement = (type: HeaderFooterCanvasElement["type"], src?: string) => {
    if (readOnly) return;
    const maxZ = layout.elements.reduce((max, el) => Math.max(max, el.z_index), 0);
    const element = createHeaderFooterElement(type, maxZ + 1);
    const nextElement = src ? { ...element, src } : element;
    const next = { version: 1 as const, elements: [...layout.elements, nextElement] };
    setSelectedId(nextElement.id);
    commitLayout(next);
  };

  const deleteSelected = () => {
    if (readOnly || !selected) return;
    const next = {
      version: 1 as const,
      elements: layout.elements.filter((el) => el.id !== selected.id),
    };
    setSelectedId(next.elements[0]?.id ?? null);
    commitLayout(next);
  };

  const duplicateSelected = () => {
    if (readOnly || !selected) return;
    const maxZ = layout.elements.reduce((max, el) => Math.max(max, el.z_index), 0);
    const copy: HeaderFooterCanvasElement = {
      ...selected,
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `hf-${Date.now()}`,
      x_pct: Math.min(96 - selected.width_pct, selected.x_pct + 4),
      y_pct: Math.min(96 - selected.height_pct, selected.y_pct + 6),
      z_index: maxZ + 1,
    };
    const next = { version: 1 as const, elements: [...layout.elements, copy] };
    setSelectedId(copy.id);
    commitLayout(next);
  };

  const changeLayer = (mode: "front" | "back" | "up" | "down") => {
    if (!selected) return;
    // Reorder elements deterministically and renumber z-indexes to 1..N.
    const ordered = [...layout.elements].sort((a, b) => a.z_index - b.z_index);
    const idx = ordered.findIndex((el) => el.id === selected.id);
    if (idx === -1) return;

    const moved = ordered.splice(idx, 1)[0];

    if (mode === "front") {
      ordered.push(moved);
    } else if (mode === "back") {
      ordered.unshift(moved);
    } else if (mode === "up") {
      const to = Math.min(ordered.length, idx + 1);
      ordered.splice(to, 0, moved);
    } else {
      const to = Math.max(0, idx - 1);
      ordered.splice(to, 0, moved);
    }

    const next = {
      version: 1 as const,
      elements: ordered.map((el, i) => ({ ...el, z_index: i + 1 })),
    };
    commitLayout(next);
  };

  const uploadImage = async (file: File) => {
    if (readOnly) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/library", { method: "POST", body: fd });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        toast.error(json.error || "Falha ao enviar imagem");
        return;
      }
      addElement("image", json.url);
    } catch {
      toast.error("Erro ao enviar imagem");
    } finally {
      setUploading(false);
    }
  };

  const updatePageNumbering = (patch: Partial<HeaderFooterPageNumberingConfig>) => {
    const next = {
      ...pageNumbering,
      ...patch,
    };
    setPageNumberingDraft(normalizePageNumbering(next));
    void onPatch({
      page_numbering: next,
    });
  };

  const startPointerEdit = (element: HeaderFooterCanvasElement, mode: "move" | "resize") => {
    return (event: React.PointerEvent<HTMLDivElement>) => {
      if (readOnly) return;
      const band = bandRef.current;
      if (!band) return;
      event.preventDefault();
      event.stopPropagation();
      setSelectedId(element.id);

      const rect = band.getBoundingClientRect();
      const pointerId = event.pointerId;
      const target = event.currentTarget;
      target.setPointerCapture(pointerId);
      const startX = event.clientX;
      const startY = event.clientY;
      const start = { ...element };
      let latest = element;

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const dxPct = ((ev.clientX - startX) / rect.width) * 100;
        const dyPct = ((ev.clientY - startY) / rect.height) * 100;
        latest =
          mode === "move"
            ? normalizeElementBounds({
                ...start,
                x_pct: start.x_pct + dxPct,
                y_pct: start.y_pct + dyPct,
              })
            : normalizeElementBounds({
                ...start,
                width_pct: start.width_pct + dxPct,
                height_pct: start.height_pct + dyPct,
              });
        setLayout((prev) => ({
          version: 1,
          elements: prev.elements.map((el) => (el.id === element.id ? latest : el)),
        }));
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        target.releasePointerCapture(pointerId);
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
        target.removeEventListener("pointercancel", onUp);
        const next = {
          version: 1 as const,
          elements: layout.elements.map((el) => (el.id === element.id ? latest : el)),
        };
        commitLayout(next);
      };

      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
      target.addEventListener("pointercancel", onUp);
    };
  };

  const bandPct = Math.min(34, Math.max(5, (Math.max(24, height) / PAGE_BASELINE_PX) * 100));

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 rounded-md border bg-card">
        <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/25 p-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 px-2 text-xs"
            disabled={readOnly}
            onClick={() => addElement("text")}
            title="Adicionar texto"
          >
            <Type className="h-4 w-4" /> Texto
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={readOnly || uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void uploadImage(file);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 px-2 text-xs"
            disabled={readOnly || uploading}
            onClick={() => fileInputRef.current?.click()}
            title="Adicionar imagem"
          >
            <ImagePlus className="h-4 w-4" /> {uploading ? "Enviando" : "Imagem"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 px-2 text-xs"
            disabled={readOnly}
            onClick={() => addElement("columns")}
            title="Adicionar colunas"
          >
            <Columns3 className="h-4 w-4" /> Colunas
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 px-2 text-xs"
            disabled={readOnly}
            onClick={() => addElement("block")}
            title="Adicionar bloco personalizado"
          >
            <Square className="h-4 w-4" /> Bloco
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 px-2 text-xs"
            disabled={readOnly}
            onClick={() => addElement("page_number")}
            title="Inserir número de página manual"
          >
            <Hash className="h-4 w-4" /> Página
          </Button>
          <div className="mx-1 h-6 w-px bg-border" />
          <IconButton title="Trazer para frente" disabled={!selected || readOnly} onClick={() => changeLayer("front")}>
            <BringToFront className="h-4 w-4" />
          </IconButton>
          <IconButton title="Enviar para trás" disabled={!selected || readOnly} onClick={() => changeLayer("back")}>
            <SendToBack className="h-4 w-4" />
          </IconButton>
          <IconButton title="Subir camada" disabled={!selected || readOnly} onClick={() => changeLayer("up")}>
            <ArrowUp className="h-4 w-4" />
          </IconButton>
          <IconButton title="Descer camada" disabled={!selected || readOnly} onClick={() => changeLayer("down")}>
            <ArrowDown className="h-4 w-4" />
          </IconButton>
          <IconButton title="Duplicar" disabled={!selected || readOnly} onClick={duplicateSelected}>
            <Copy className="h-4 w-4" />
          </IconButton>
          <IconButton title="Remover" disabled={!selected || readOnly} onClick={deleteSelected}>
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="overflow-auto bg-[#e7e6e6] p-4">
          <div
            className="relative mx-auto w-full max-w-[760px] border border-neutral-400 bg-white shadow"
            style={{ aspectRatio: "210 / 297" }}
          >
            <div
              ref={bandRef}
              className={cn(
                "absolute left-0 right-0 overflow-hidden bg-white ring-1 ring-inset ring-primary/40",
                region === "header" ? "top-0" : "bottom-0",
              )}
              style={{ height: `${bandPct}%` }}
              onPointerDown={() => setSelectedId(null)}
            >
              <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-neutral-300" />
              {sortedElements.map((element) => (
                <HeaderFooterCanvasElementView
                  key={element.id}
                  element={element}
                  selected={selectedId === element.id}
                  readOnly={readOnly}
                  onSelect={() => setSelectedId(element.id)}
                  onMoveStart={startPointerEdit(element, "move")}
                  onResizeStart={startPointerEdit(element, "resize")}
                />
              ))}
            </div>
            <div
              className={cn(
                "pointer-events-none absolute left-2 rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow",
                region === "header" ? "top-1" : "bottom-1",
              )}
            >
              {region === "header" ? "Cabeçalho" : "Rodapé"}
            </div>
          </div>
        </div>
      </div>

      <aside className="space-y-3 rounded-md border bg-card p-3">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Hash className="h-3.5 w-3.5" /> Numeração
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={pageNumbering.enabled}
              disabled={readOnly}
              onCheckedChange={(v) => updatePageNumbering({ enabled: v === true })}
            />
            Ativar
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Página inicial">
              <Input
                type="number"
                min={1}
                className="h-8 text-xs"
                disabled={readOnly}
                value={pageNumbering.start_at_page}
                onChange={(e) => updatePageNumbering({ start_at_page: Number(e.target.value) || 1 })}
              />
            </Field>
            <Field label="Número inicial">
              <Input
                type="number"
                min={0}
                className="h-8 text-xs"
                disabled={readOnly}
                value={pageNumbering.first_page_number}
                onChange={(e) => updatePageNumbering({ first_page_number: Number(e.target.value) || 1 })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={pageNumbering.hide_on_cover}
              disabled={readOnly}
              onCheckedChange={(v) => updatePageNumbering({ hide_on_cover: v === true })}
            />
            Ocultar na capa
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={pageNumbering.inner_only}
              disabled={readOnly}
              onCheckedChange={(v) => updatePageNumbering({ inner_only: v === true })}
            />
            Apenas páginas internas
          </label>
          <div className="rounded border bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground">
            {formatGeneratedPageNumber({
              config: pageNumbering,
              pageNumber: Math.max(DEFAULT_PAGE_NUMBERING.start_at_page, pageNumbering.start_at_page),
              totalPages: Math.max(8, pageNumbering.start_at_page + 4),
            })}
          </div>
        </div>

        <div className="border-t pt-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Layers className="h-3.5 w-3.5" /> Camadas
          </div>
          <div className="max-h-32 space-y-1 overflow-auto">
            {layerList.length ? (
              layerList.map((el) => (
                <button
                  key={el.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded border px-2 py-1 text-left text-xs",
                    selectedId === el.id ? "border-primary bg-primary/10" : "bg-background hover:bg-muted/40",
                  )}
                  onClick={() => setSelectedId(el.id)}
                >
                  <span className="truncate">{elementName(el)}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{el.z_index}</span>
                </button>
              ))
            ) : (
              <div className="rounded border border-dashed px-2 py-4 text-center text-xs text-muted-foreground">
                Sem elementos
              </div>
            )}
          </div>
        </div>

        {selected ? (
          <ElementInspector
            element={selected}
            readOnly={readOnly}
            onChange={(patch) => updateElement(selected.id, patch)}
          />
        ) : null}
      </aside>
    </div>
  );
}

function HeaderFooterCanvasElementView({
  element,
  selected,
  readOnly,
  onSelect,
  onMoveStart,
  onResizeStart,
}: {
  element: HeaderFooterCanvasElement;
  selected: boolean;
  readOnly?: boolean;
  onSelect: () => void;
  onMoveStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const style: React.CSSProperties = {
    left: `${element.x_pct}%`,
    top: `${element.y_pct}%`,
    width: `${element.width_pct}%`,
    height: `${element.height_pct}%`,
    zIndex: element.z_index,
    opacity: element.opacity ?? 1,
    transform: element.rotate_deg ? `rotate(${element.rotate_deg}deg)` : undefined,
  };

  return (
    <div
      className={cn(
        "absolute select-none overflow-hidden border",
        selected ? "border-primary shadow-[0_0_0_1px_hsl(var(--primary))]" : "border-transparent",
        readOnly ? "cursor-default" : "cursor-move",
      )}
      style={style}
      onPointerDown={onMoveStart}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <div
        className="h-full w-full overflow-hidden whitespace-pre-wrap"
        style={{
          color: element.color ?? "#111827",
          backgroundColor: element.background_color || "transparent",
          borderColor: element.border_color || "transparent",
          fontSize: `${element.font_size ?? 11}px`,
          fontWeight: element.font_weight ?? "normal",
          fontStyle: element.font_style ?? "normal",
          textAlign: element.text_align ?? "left",
          padding: element.padding ?? 4,
        }}
      >
        {element.type === "image" ? (
          element.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={element.src} alt="" className="h-full w-full object-contain" draggable={false} />
          ) : (
            <div className="grid h-full place-items-center text-xs text-muted-foreground">Imagem</div>
          )
        ) : element.type === "columns" ? (
          <div className="grid h-full grid-cols-3 gap-2">
            {(element.columns?.length ? element.columns : ["", "", ""]).slice(0, 3).map((text, idx) => (
              <div key={idx} className="min-w-0 border-r border-dashed last:border-r-0">
                {text}
              </div>
            ))}
          </div>
        ) : element.type === "page_number" ? (
          element.text || "{{page}} / {{total}}"
        ) : (
          element.text
        )}
      </div>
      {selected && !readOnly ? (
        <span
          className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize border border-white bg-primary"
          onPointerDown={onResizeStart}
        />
      ) : null}
    </div>
  );
}

function ElementInspector({
  element,
  readOnly,
  onChange,
}: {
  element: HeaderFooterCanvasElement;
  readOnly?: boolean;
  onChange: (patch: Partial<HeaderFooterCanvasElement>) => void;
}) {
  const align = element.text_align ?? "left";
  return (
    <div className="space-y-3 border-t pt-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {elementName(element)}
      </div>
      {element.type !== "image" ? (
        element.type === "columns" ? (
          <div className="space-y-2">
            {[0, 1, 2].map((idx) => (
              <Field key={idx} label={`Coluna ${idx + 1}`}>
                <Input
                  className="h-8 text-xs"
                  disabled={readOnly}
                  value={element.columns?.[idx] ?? ""}
                  onChange={(e) => {
                    const cols = [...(element.columns ?? ["", "", ""])];
                    cols[idx] = e.target.value;
                    onChange({ columns: cols });
                  }}
                />
              </Field>
            ))}
          </div>
        ) : (
          <Field label="Texto">
            <Textarea
              className="min-h-20 text-xs"
              disabled={readOnly}
              value={element.text ?? ""}
              onChange={(e) => onChange({ text: e.target.value })}
            />
          </Field>
        )
      ) : (
        <Field label="URL">
          <Input
            className="h-8 text-xs"
            disabled={readOnly}
            value={element.src ?? ""}
            onChange={(e) => onChange({ src: e.target.value })}
          />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" value={element.x_pct} disabled={readOnly} onChange={(v) => onChange({ x_pct: v })} />
        <NumberField label="Y" value={element.y_pct} disabled={readOnly} onChange={(v) => onChange({ y_pct: v })} />
        <NumberField label="Larg." value={element.width_pct} disabled={readOnly} onChange={(v) => onChange({ width_pct: v })} />
        <NumberField label="Alt." value={element.height_pct} disabled={readOnly} onChange={(v) => onChange({ height_pct: v })} />
        <NumberField label="Camada" value={element.z_index} disabled={readOnly} onChange={(v) => onChange({ z_index: v })} />
        <NumberField label="Fonte" value={element.font_size ?? 11} disabled={readOnly} onChange={(v) => onChange({ font_size: v })} />
      </div>
      <div className="flex items-center gap-1">
        <IconButton
          title="Alinhar à esquerda"
          active={align === "left"}
          disabled={readOnly}
          onClick={() => onChange({ text_align: "left" })}
        >
          <AlignLeft className="h-4 w-4" />
        </IconButton>
        <IconButton
          title="Centralizar"
          active={align === "center"}
          disabled={readOnly}
          onClick={() => onChange({ text_align: "center" })}
        >
          <AlignCenter className="h-4 w-4" />
        </IconButton>
        <IconButton
          title="Alinhar à direita"
          active={align === "right"}
          disabled={readOnly}
          onClick={() => onChange({ text_align: "right" })}
        >
          <AlignRight className="h-4 w-4" />
        </IconButton>
        <Button
          type="button"
          size="sm"
          variant={element.font_weight === "bold" ? "default" : "ghost"}
          className="h-8 px-2 text-xs font-bold"
          disabled={readOnly}
          onClick={() => onChange({ font_weight: element.font_weight === "bold" ? "normal" : "bold" })}
        >
          B
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Cor">
          <Input
            type="color"
            className="h-8 p-1"
            disabled={readOnly}
            value={safeColor(element.color, "#111827")}
            onChange={(e) => onChange({ color: e.target.value })}
          />
        </Field>
        <div className="grid gap-1">
          <span className="text-[11px] text-muted-foreground">Fundo</span>
          <div className="flex items-center gap-1.5">
            <Input
              type="color"
              className="h-8 p-1 flex-1"
              disabled={readOnly || element.background_color === "transparent"}
              value={safeColor(element.background_color, "#ffffff")}
              onChange={(e) => onChange({ background_color: e.target.value })}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2 text-[10px]"
              disabled={readOnly}
              onClick={() => onChange({ background_color: element.background_color === "transparent" ? "#ffffff" : "transparent" })}
              title={element.background_color === "transparent" ? "Usar cor sólida" : "Deixar transparente"}
            >
              {element.background_color === "transparent" ? "Cor" : "Transp."}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        className="h-8 text-xs"
        disabled={disabled}
        value={Number.isFinite(value) ? Math.round(value * 10) / 10 : 0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </Field>
  );
}

function IconButton({
  title,
  children,
  disabled,
  active,
  onClick,
}: {
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "ghost"}
      className="h-8 w-8 p-0"
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      {children}
    </Button>
  );
}

function elementName(element: HeaderFooterCanvasElement): string {
  if (element.type === "image") return "Imagem";
  if (element.type === "columns") return "Colunas";
  if (element.type === "block") return "Bloco";
  if (element.type === "page_number") return "Número de página";
  return "Texto";
}

function normalizeElementBounds(element: HeaderFooterCanvasElement): HeaderFooterCanvasElement {
  const width = clamp(element.width_pct, 1, 100);
  const height = clamp(element.height_pct, 1, 100);
  return {
    ...element,
    width_pct: width,
    height_pct: height,
    x_pct: clamp(element.x_pct, 0, Math.max(0, 100 - width)),
    y_pct: clamp(element.y_pct, 0, Math.max(0, 100 - height)),
    z_index: Math.round(Number(element.z_index) || 0),
    text_align: normalizeTextAlign(element.text_align),
  };
}

function normalizeTextAlign(value: unknown): HeaderFooterTextAlign {
  return value === "center" || value === "right" || value === "justify" ? value : "left";
}

function clamp(value: unknown, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function safeColor(value: string | undefined, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value! : fallback;
}

function visibilityPatchFor(
  scope: HeaderFooterLayoutScope,
  region: HeaderFooterLayoutRegion,
  hasElements: boolean,
): Partial<HeaderFooterBlockProps> {
  if (!hasElements) return {};
  if (region === "header") {
    if (scope === "all") return { cover_show_header_band: true, inner_show_header_band: true };
    if (scope === "cover") return { cover_show_header_band: true };
    return { inner_show_header_band: true };
  }
  if (scope === "all") return { cover_show_footer_band: true, inner_show_footer_band: true };
  if (scope === "cover") return { cover_show_footer_band: true };
  return { inner_show_footer_band: true };
}

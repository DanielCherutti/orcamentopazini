
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { Mark, Node as TiptapNode, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { ResizableImage } from '@/components/ui/resizable-image-extension';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { goToNextCell } from 'prosemirror-tables';
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Heading1, Heading2, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  ImagePlus, Table2, PanelTop, PanelBottom, Hash, ChevronDown, GripHorizontal,
  Braces,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { WordPageClientLogo } from '@/components/budgets/compositor/word-page-client-logo';
import { WordPageWatermark } from '@/components/budgets/compositor/word-page-watermark';
import { WORD_BAND_THREE_COLUMNS_HTML } from '@/lib/compositor/word-header-templates';
import { TEMPLATE_VARIABLE_TOKENS } from '@/lib/model-variables';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  onUploadImage?: (file: File) => Promise<string>;
  extraToolbarItems?: React.ReactNode;
  onEditorReady?: (insertImage: (url: string) => void) => void;
  persistenceKey?: string;
  /** Faixa tipo Microsoft Word (abas + grupos Fonte / Parágrafo / Estilos). */
  variant?: 'default' | 'word';
  readOnly?: boolean;
  /**
   * Só `variant="word"`: imagens na “folha” A4 atrás do texto (capa do compositor).
   */
  wordPageWatermarkUrl?: string;
  wordPageWatermarkOpacity?: number;
  /** Escala visual da marca d'água na folha (%). */
  wordPageWatermarkScalePct?: number;
  /** Modo livre: arrastar e redimensionar marca d'água na página. */
  wordPageWatermarkLayout?: {
    readOnly: boolean;
    xPct: number;
    yPct: number;
    widthPct: number;
    aspect?: number;
    onLayoutChange: (layout: { xPct: number; yPct: number; widthPct: number }) => void;
    onAspectChange: (aspect: number) => void;
  };
  /** Logomarca do cliente na folha (arrastar/redimensionar). */
  wordPageClientLogo?: {
    url: string;
    readOnly: boolean;
    xPct: number;
    yPct: number;
    widthPct: number;
    aspect?: number;
    onLayoutChange: (layout: { xPct: number; yPct: number; widthPct: number }) => void;
    onAspectChange: (aspect: number) => void;
  };
  /** Só `variant="word"`: texto fixo no canto inferior esquerdo da folha. */
  wordPageBottomLeftText?: string;
  /** Guias visuais de cabeçalho/corpo/rodapé no modo Word. */
  wordPageBands?: {
    headerHeight: number;
    footerHeight: number;
    activeBand?: "header" | "footer";
    onSelectBand?: (band: "header" | "footer") => void;
    onApplyTemplate?: (payload: { band: "header" | "footer"; template: WordBandTemplateId }) => void;
    onHeaderHeightChange?: (height: number) => void;
    onFooterHeightChange?: (height: number) => void;
  };
  /**
   * Normalização aplicada ao HTML antes de `onChange` (ex.: sanitize ao salvar).
   * Deve ser a mesma função usada pelo pai em `value`, para não re-sincronizar o editor a cada tecla.
   */
  valueNormalize?: (html: string) => string;
}

const WORD_RIBBON_TABS = [
  { id: "file" as const, label: "Arquivo" },
  { id: "home" as const, label: "Página inicial" },
  { id: "insert" as const, label: "Inserir" },
  { id: "draw" as const, label: "Desenhar" },
  { id: "design" as const, label: "Design" },
  { id: "layout" as const, label: "Layout" },
  { id: "references" as const, label: "Referências" },
  { id: "mailings" as const, label: "Correspondências" },
  { id: "view" as const, label: "Exibir" },
  { id: "help" as const, label: "Ajuda" },
];

type WordRibbonTabId = (typeof WORD_RIBBON_TABS)[number]["id"];
type WordBandTemplateId = "blank" | "blank_three_columns";

function hoistFloatingImages(html: string): string {
  if (!html || !/data-floating\s*=\s*["']true["']|position\s*:\s*absolute/i.test(html)) {
    return html;
  }
  const floatingImages: string[] = [];
  const withoutFloatingImages = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const isFloating =
      /\bdata-floating\s*=\s*["']true["']/i.test(tag) ||
      /\bstyle\s*=\s*["'][^"']*position\s*:\s*absolute/i.test(tag);
    if (!isFloating) return tag;
    floatingImages.push(tag);
    return "";
  });
  if (!floatingImages.length) return html;
  const body = withoutFloatingImages
    .replace(/<p>\s*(?:<br\s*\/?>)?\s*<\/p>/gi, "")
    .trim();
  return `${body}<p class="word-floating-anchor">${floatingImages.join("")}</p>`;
}

function needsFloatingHoist(html: string): boolean {
  if (!html || !/data-floating\s*=\s*["']true["']/i.test(html)) return false;
  if (typeof document === "undefined") return false;
  const root = document.createElement("div");
  root.innerHTML = html;
  const imgs = root.querySelectorAll('img[data-floating="true"]');
  if (!imgs.length) return false;
  for (const img of imgs) {
    if (!img.closest("p.word-floating-anchor")) return true;
  }
  const table = root.querySelector("table");
  const anchor = root.querySelector("p.word-floating-anchor");
  if (table && anchor && anchor.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING) {
    return true;
  }
  return false;
}

function getHoistedHtmlIfNeeded(html: string): string | null {
  if (!needsFloatingHoist(html)) return null;
  const hoisted = hoistFloatingImages(html);
  return hoisted !== html ? hoisted : null;
}

function scheduleSetContent(editor: Editor, html: string, onApplied?: (next: string) => void) {
  queueMicrotask(() => {
    if (editor.isDestroyed) return;
    if (editor.getHTML() === html) {
      onApplied?.(html);
      return;
    }
    editor.commands.setContent(html, { emitUpdate: false });
    onApplied?.(html);
  });
}

/** Evita flushSync do TipTap ao montar EditorContent durante o render do pai. */
function TiptapEditorSurface({
  editor,
  className,
  style,
}: {
  editor: Editor;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (active) setMounted(true);
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [editor]);
  if (!mounted) {
    return <div className={className} style={style} aria-hidden />;
  }
  return (
    <div className={className} style={style}>
      <EditorContent editor={editor} />
    </div>
  );
}

const FontSizeMark = Mark.create({
  name: 'fontSize',
  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: (element) => {
          const inline = (element as HTMLElement).style.fontSize;
          return inline || null;
        },
        renderHTML: (attributes) => {
          if (!attributes.size) return {};
          return { style: `font-size: ${String(attributes.size)}` };
        },
      },
    };
  },
  parseHTML() {
    return [{ style: 'font-size' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
});

const PageBreakNode = TiptapNode.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [
      {
        tag: 'div[data-page-break="true"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-page-break": "true",
        class: "editor-page-break",
      }),
      ["span", { contenteditable: "false" }, "Quebra de página"],
    ];
  },
});

function getWordBandPercents(headerHeight: number, footerHeight: number) {
  const PAGE_BASELINE_PX = 1122;
  const headerPct = Math.min(
    40,
    Math.max(4, (Math.max(24, Number(headerHeight) || 24) / PAGE_BASELINE_PX) * 100),
  );
  const footerPct = Math.min(
    45,
    Math.max(4, (Math.max(24, Number(footerHeight) || 24) / PAGE_BASELINE_PX) * 100),
  );
  const bodyStart = headerPct;
  const bodyEnd = Math.max(bodyStart + 8, 100 - footerPct);
  return { headerPct, footerPct, bodyStart, bodyEnd };
}

function RulerCorner() {
  return <div className="h-6 w-6 shrink-0 border border-neutral-500/45 bg-[#d8d8d8]" />;
}

function RulerHorizontal({ className }: { className?: string }) {
  return (
    <div
      className={cn('h-6 shrink-0 border border-l-0 border-neutral-500/45 bg-[#e8e8e8]', className)}
      style={{
        backgroundImage:
          'repeating-linear-gradient(90deg, #e8e8e8 0px, #e8e8e8 7px, #b0b0b0 7px, #e8e8e8 8px)',
      }}
    />
  );
}

function RulerVertical({ className }: { className?: string }) {
  return (
    <div
      className={cn('w-6 shrink-0 self-stretch border border-t-0 border-neutral-500/45 bg-[#e8e8e8]', className)}
      style={{
        backgroundImage:
          'repeating-linear-gradient(180deg, #e8e8e8 0px, #e8e8e8 7px, #b0b0b0 7px, #e8e8e8 8px)',
      }}
    />
  );
}

export function RichTextEditor({
  value,
  onChange,
  onUploadImage,
  extraToolbarItems,
  onEditorReady,
  persistenceKey: _persistenceKey,
  variant = 'default',
  readOnly = false,
  wordPageWatermarkUrl,
  wordPageWatermarkOpacity = 0.12,
  wordPageWatermarkScalePct = 100,
  wordPageWatermarkLayout,
  wordPageClientLogo,
  wordPageBottomLeftText,
  wordPageBands,
  valueNormalize,
}: RichTextEditorProps) {
  const shouldUseFloatingHeaderImages = variant === "word" && !!wordPageBands;
  const normalizeStoredHtml = useCallback(
    (html: string) => valueNormalize?.(html) ?? html,
    [valueNormalize],
  );
  const initialEditorValue = shouldUseFloatingHeaderImages
    ? hoistFloatingImages(normalizeStoredHtml(value || ""))
    : normalizeStoredHtml(value || "");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wordPaperRef = useRef<HTMLDivElement>(null);
  const bandScrollRef = useRef<HTMLDivElement>(null);
  const [wordRibbonTab, setWordRibbonTab] = useState<WordRibbonTabId>("home");
  const bandDragRef = useRef<{
    kind: "header" | "footer";
    startY: number;
    startHeight: number;
    paperHeight: number;
  } | null>(null);
  const [previewBandHeights, setPreviewBandHeights] = useState({
    headerHeight: wordPageBands?.headerHeight ?? 96,
    footerHeight: wordPageBands?.footerHeight ?? 40,
  });
  const [fontSizePx, setFontSizePx] = useState<number>(11);
  const [imageSelection, setImageSelection] = useState<{
    active: boolean;
    align: "left" | "center" | "right";
  }>({ active: false, align: "center" });
  const [headerTemplateOpen, setHeaderTemplateOpen] = useState(false);
  const [footerTemplateOpen, setFooterTemplateOpen] = useState(false);
  const previewBandHeightsRef = useRef(previewBandHeights);
  const lastEmittedHtmlRef = useRef(initialEditorValue);

  const isWord = variant === 'word';

  useEffect(() => {
    if (bandDragRef.current) return;
    const next = {
      headerHeight: wordPageBands?.headerHeight ?? 96,
      footerHeight: wordPageBands?.footerHeight ?? 40,
    };
    queueMicrotask(() => {
      setPreviewBandHeights((prev) =>
        prev.headerHeight === next.headerHeight && prev.footerHeight === next.footerHeight
          ? prev
          : next,
      );
    });
  }, [wordPageBands?.headerHeight, wordPageBands?.footerHeight]);

  useEffect(() => {
    previewBandHeightsRef.current = previewBandHeights;
  }, [previewBandHeights]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      FontSizeMark,
      PageBreakNode,
      ResizableImage.configure({ inline: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'], defaultAlignment: isWord ? 'left' : 'justify' }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: shouldUseFloatingHeaderImages ? hoistFloatingImages(initialEditorValue) : initialEditorValue,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const stored = normalizeStoredHtml(html);
      lastEmittedHtmlRef.current = stored;
      onChange(stored);
      if (!shouldUseFloatingHeaderImages) return;
      const hoisted = getHoistedHtmlIfNeeded(html);
      if (!hoisted) return;
      const storedHoisted = normalizeStoredHtml(hoisted);
      scheduleSetContent(editor, hoisted, () => {
        lastEmittedHtmlRef.current = storedHoisted;
        onChange(storedHoisted);
      });
    },
    onCreate: ({ editor }) => {
      if (shouldUseFloatingHeaderImages) {
        requestAnimationFrame(() => {
          const hoisted = getHoistedHtmlIfNeeded(editor.getHTML());
          if (hoisted) scheduleSetContent(editor, hoisted);
        });
      }
      if (onEditorReady) {
        queueMicrotask(() => {
          if (editor.isDestroyed) return;
          onEditorReady((url: string) => {
            editor
              .chain()
              .focus()
              .setImage(
                shouldUseFloatingHeaderImages
                  ? { src: url, floating: true, x: 8, y: 8, width: 96 }
                  : { src: url, imageAlign: "center", floating: false }
              )
              .run();
          });
        });
      }
    },
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (event.key === 'Tab') {
          const { $from } = _view.state.selection;
          let isInsideTableCell = false;
          for (let depth = $from.depth; depth > 0; depth -= 1) {
            const nodeName = $from.node(depth)?.type?.name;
            if (nodeName === 'tableCell' || nodeName === 'tableHeader') {
              isInsideTableCell = true;
              break;
            }
          }
          if (isInsideTableCell) {
            event.preventDefault();
            const moved = goToNextCell(event.shiftKey ? -1 : 1)(_view.state, _view.dispatch);
            return moved || true;
          }
          event.preventDefault();
          _view.dispatch(_view.state.tr.insertText('\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0'));
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (!file) continue;
            event.preventDefault();
            if (onUploadImage) {
              onUploadImage(file).then((url) => {
                editor
                  ?.chain()
                  .focus()
                  .setImage(
                    shouldUseFloatingHeaderImages
                      ? { src: url, floating: true, x: 8, y: 8, width: 96 }
                      : { src: url, imageAlign: "center", floating: false }
                  )
                  .run();
              }).catch(() => {});
            } else {
              const reader = new FileReader();
              reader.onload = (e) => {
                const dataUrl = e.target?.result as string;
                if (dataUrl) {
                  editor
                    ?.chain()
                    .focus()
                    .setImage(
                      shouldUseFloatingHeaderImages
                        ? { src: dataUrl, floating: true, x: 8, y: 8, width: 96 }
                        : { src: dataUrl, imageAlign: "center", floating: false }
                    )
                    .run();
                }
              };
              reader.readAsDataURL(file);
            }
            return true;
          }
        }
        return false;
      },
      attributes: {
        class: cn(
          'tiptap-content focus:outline-none w-full text-neutral-900',
          isWord
            ? wordPageBands
              ? "word-band-mode py-[1mm] text-[11pt] leading-snug"
              : "min-h-full px-[22mm] py-[18mm] text-[11pt] leading-relaxed"
            : "min-h-[300px] p-4 border rounded-md text-justify",
        ),
      },
    },
  }, [isWord, readOnly]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor) return;
    const syncFontSize = () => {
      const raw = String(editor.getAttributes('fontSize')?.size ?? '').trim();
      const parsed = parseInt(raw.replace(/[^\d.-]/g, ''), 10);
      if (Number.isFinite(parsed) && parsed >= 8 && parsed <= 96) {
        setFontSizePx(parsed);
      }
      const imageAttrs = editor.getAttributes("image");
      const align = imageAttrs.imageAlign === "left" || imageAttrs.imageAlign === "right"
        ? imageAttrs.imageAlign
        : "center";
      setImageSelection({
        active: editor.isActive("image"),
        align,
      });
    };
    syncFontSize();
    editor.on('selectionUpdate', syncFontSize);
    editor.on('update', syncFontSize);
    return () => {
      editor.off('selectionUpdate', syncFontSize);
      editor.off('update', syncFontSize);
    };
  }, [editor]);

  useEffect(() => {
    if (!bandScrollRef.current) return;
    bandScrollRef.current.scrollTop = 0;
  }, [wordPageBands?.activeBand, previewBandHeights.headerHeight, previewBandHeights.footerHeight]);

  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    const stored = normalizeStoredHtml(value || "");
    const normalized = shouldUseFloatingHeaderImages
      ? hoistFloatingImages(stored)
      : stored;
    if (stored === lastEmittedHtmlRef.current) return;
    if (editor.isFocused) return;
    if (editor.getHTML() === normalized) {
      lastEmittedHtmlRef.current = stored;
      return;
    }
    queueMicrotask(() => {
      if (cancelled || editor.isDestroyed) return;
      if (editor.isFocused) return;
      if (normalizeStoredHtml(editor.getHTML()) === stored) {
        lastEmittedHtmlRef.current = stored;
        return;
      }
      editor.commands.setContent(normalized, { emitUpdate: false });
      lastEmittedHtmlRef.current = stored;
    });
    return () => {
      cancelled = true;
    };
  }, [value, editor, shouldUseFloatingHeaderImages, normalizeStoredHtml]);

  if (!editor) return null;

  const focusWordEditorSelectAll = () => {
    if (readOnly) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        editor.chain().focus().selectAll().run();
      });
    });
  };

  const clampFontSize = (n: number) => Math.max(8, Math.min(96, Math.round(n)));
  const applyFontSize = (n: number) => {
    const px = clampFontSize(n);
    setFontSizePx(px);
    editor.chain().focus().setMark('fontSize', { size: `${px}px` }).run();
  };

  const wc = isWord ? 'h-7 w-7 p-0' : undefined;
  const setSelectedImageAlign = (align: "left" | "center" | "right") => {
    editor
      .chain()
      .focus()
      .updateAttributes("image", { imageAlign: align, floating: false })
      .run();
    setImageSelection({ active: true, align });
  };

  const hiddenImageInput = onUploadImage ? (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      aria-hidden
      onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file || !onUploadImage) return;
        const url = await onUploadImage(file);
        editor
          .chain()
          .focus()
          .setImage(
            shouldUseFloatingHeaderImages
              ? { src: url, floating: true, x: 8, y: 8, width: 96 }
              : { src: url, imageAlign: "center", floating: false }
          )
          .run();
        e.target.value = "";
      }}
    />
  ) : null;

  const imageToolbarButton = onUploadImage ? (
    <>
      <div className={cn("my-auto h-6 w-px bg-border", isWord && "bg-neutral-300")} />
      <Button
        variant="ghost"
        size="sm"
        type="button"
        title="Inserir imagem do computador"
        onClick={() => fileInputRef.current?.click()}
        className={wc}
      >
        <ImagePlus className="h-4 w-4" />
      </Button>
    </>
  ) : null;

  const imagePositionTools = imageSelection.active ? (
    <>
      <div className={cn("my-auto h-6 w-px bg-border", isWord && "bg-neutral-300")} />
      <div className="flex items-center gap-0.5" aria-label="Posição da imagem">
        <Button
          variant={imageSelection.align === "left" ? "default" : "ghost"}
          size="sm"
          type="button"
          title="Imagem à esquerda"
          onClick={() => setSelectedImageAlign("left")}
          className={wc}
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button
          variant={imageSelection.align === "center" ? "default" : "ghost"}
          size="sm"
          type="button"
          title="Imagem ao centro"
          onClick={() => setSelectedImageAlign("center")}
          className={wc}
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button
          variant={imageSelection.align === "right" ? "default" : "ghost"}
          size="sm"
          type="button"
          title="Imagem à direita"
          onClick={() => setSelectedImageAlign("right")}
          className={wc}
        >
          <AlignRight className="h-4 w-4" />
        </Button>
      </div>
    </>
  ) : null;

  const insertPageBreak = () => {
    editor
      .chain()
      .focus()
      .insertContent('<div data-page-break="true" class="editor-page-break"><span contenteditable="false">Quebra de página</span></div><p></p>')
      .run();
  };

  const groupedVariables = TEMPLATE_VARIABLE_TOKENS.reduce<Record<string, typeof TEMPLATE_VARIABLE_TOKENS>>(
    (acc, token) => {
      if (!acc[token.group]) acc[token.group] = [];
      acc[token.group].push(token);
      return acc;
    },
    {},
  );

  const variableToolbarItem = (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          title="Inserir variável"
          className={wc}
        >
          <Braces className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <div className="mb-2 text-xs font-semibold text-muted-foreground">Variáveis do documento</div>
        <div className="max-h-80 space-y-3 overflow-y-auto">
          {Object.entries(groupedVariables).map(([group, tokens]) => (
            <div key={group} className="space-y-1.5">
              <div className="px-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {group}
              </div>
              {tokens.map((item) => (
                <button
                  key={item.token}
                  type="button"
                  className="w-full rounded-md border bg-background p-2 text-left hover:bg-muted/50"
                  onClick={() => editor.chain().focus().insertContent(item.token).run()}
                >
                  <div className="text-xs font-medium">{item.label}</div>
                  <code className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {item.token}
                  </code>
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );

  const fontToolsBasic = (
    <>
      <Button
        variant={editor.isActive("bold") ? "default" : "ghost"}
        size="sm"
        onClick={() => editor.chain().focus().toggleBold().run()}
        type="button"
        className={wc}
      >
        <Bold className="h-4 w-4" />
      </Button>
      <Button
        variant={editor.isActive("italic") ? "default" : "ghost"}
        size="sm"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        type="button"
        className={wc}
      >
        <Italic className="h-4 w-4" />
      </Button>
      <Button
        variant={editor.isActive("underline") ? "default" : "ghost"}
        size="sm"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        type="button"
        className={wc}
      >
        <UnderlineIcon className="h-4 w-4" />
      </Button>
    </>
  );

  const fontTools = (
    <>
      {fontToolsBasic}
      {imageToolbarButton}
      {imagePositionTools}
      {variableToolbarItem}
      {extraToolbarItems}
    </>
  );

  const paragraphTools = (
    <>
      <Button
        variant={editor.isActive('heading', { level: 1 }) ? 'default' : 'ghost'}
        size="sm"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        type="button"
        className={wc}
      >
        <Heading1 className="w-4 h-4" />
      </Button>
      <Button
        variant={editor.isActive('heading', { level: 2 }) ? 'default' : 'ghost'}
        size="sm"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        type="button"
        className={wc}
      >
        <Heading2 className="w-4 h-4" />
      </Button>
      <div className={cn('w-px bg-border h-6 my-auto', isWord && 'bg-neutral-300')} />
      <Button
        variant={editor.isActive('bulletList') ? 'default' : 'ghost'}
        size="sm"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        type="button"
        className={wc}
      >
        <List className="w-4 h-4" />
      </Button>
      <Button
        variant={editor.isActive('orderedList') ? 'default' : 'ghost'}
        size="sm"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        type="button"
        className={wc}
      >
        <ListOrdered className="w-4 h-4" />
      </Button>
      <div className={cn('w-px bg-border h-6 my-auto', isWord && 'bg-neutral-300')} />
      <Button
        variant={editor.isActive({ textAlign: 'left' }) ? 'default' : 'ghost'}
        size="sm"
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        type="button"
        title="Alinhar à esquerda"
        className={wc}
      >
        <AlignLeft className="w-4 h-4" />
      </Button>
      <Button
        variant={editor.isActive({ textAlign: 'center' }) ? 'default' : 'ghost'}
        size="sm"
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        type="button"
        title="Centralizar"
        className={wc}
      >
        <AlignCenter className="w-4 h-4" />
      </Button>
      <Button
        variant={editor.isActive({ textAlign: 'right' }) ? 'default' : 'ghost'}
        size="sm"
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        type="button"
        title="Alinhar à direita"
        className={wc}
      >
        <AlignRight className="w-4 h-4" />
      </Button>
      <Button
        variant={editor.isActive({ textAlign: 'justify' }) ? 'default' : 'ghost'}
        size="sm"
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        type="button"
        title="Justificar"
        className={wc}
      >
        <AlignJustify className="w-4 h-4" />
      </Button>
      <div className={cn('w-px bg-border h-6 my-auto', isWord && 'bg-neutral-300')} />
      <Button
        variant="ghost"
        size="sm"
        onClick={insertPageBreak}
        type="button"
        title="Inserir quebra de página"
        className={wc}
      >
        <GripHorizontal className="w-4 h-4" />
      </Button>
    </>
  );

  const allTools = (
    <>
      {fontTools}
      <div className={cn('w-px bg-border h-6 my-auto', isWord && 'bg-neutral-300')} />
      {paragraphTools}
    </>
  );

  const wordRibbonOtherMessage =
    wordRibbonTab === "file"
      ? "Não há Novo/Abrir/Salvar aqui: o texto é guardado com o orçamento. Use a visualização em PDF para imprimir."
      : "Esta faixa imita o Word, mas ainda não há comandos neste editor.";

  const insertHeaderThreeColumns = () => {
    editor.chain().focus().insertContent(WORD_BAND_THREE_COLUMNS_HTML).run();
  };

  const focusWordBand = (band: "header" | "footer") => {
    if (wordPageBands?.onSelectBand) {
      wordPageBands.onSelectBand(band);
    }
    if (!readOnly) {
      editor.chain().focus().run();
    }
  };

  const applyWordBandTemplate = (band: "header" | "footer", template: WordBandTemplateId) => {
    focusWordBand(band);
    wordPageBands?.onApplyTemplate?.({ band, template });
  };

  const startBandResize = (kind: "header" | "footer") => (e: React.PointerEvent) => {
    if (!wordPageBands) return;
    e.preventDefault();
    e.stopPropagation();
    wordPageBands.onSelectBand?.(kind);
    const paper = wordPaperRef.current;
    if (!paper) return;
    const rect = paper.getBoundingClientRect();
    if (rect.height <= 0) return;
    const pid = e.pointerId;
    bandDragRef.current = {
      kind,
      startY: e.clientY,
      startHeight: kind === "header" ? previewBandHeights.headerHeight : previewBandHeights.footerHeight,
      paperHeight: rect.height,
    };
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      const d = bandDragRef.current;
      if (!d) return;
      ev.preventDefault();
      const dyPx = ev.clientY - d.startY;
      const deltaBasePx = (dyPx / d.paperHeight) * 1122;
      if (d.kind === "header") {
        const next = Math.max(24, Math.min(320, Math.round(d.startHeight + deltaBasePx)));
        setPreviewBandHeights((prev) => ({ ...prev, headerHeight: next }));
      } else {
        const next = Math.max(24, Math.min(320, Math.round(d.startHeight - deltaBasePx)));
        setPreviewBandHeights((prev) => ({ ...prev, footerHeight: next }));
      }
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      ev.preventDefault();
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      const d = bandDragRef.current;
      bandDragRef.current = null;
      if (!d || !wordPageBands) return;
      if (d.kind === "header") {
        wordPageBands.onHeaderHeightChange?.(previewBandHeightsRef.current.headerHeight);
      } else {
        wordPageBands.onFooterHeightChange?.(previewBandHeightsRef.current.footerHeight);
      }
    };
    window.addEventListener("pointermove", onMove, { capture: true, passive: false });
    window.addEventListener("pointerup", onUp, { capture: true, passive: false });
    window.addEventListener("pointercancel", onUp, { capture: true, passive: false });
  };

  const activeBandHeightPx = wordPageBands
    ? (wordPageBands.activeBand === "footer" ? previewBandHeights.footerHeight : previewBandHeights.headerHeight)
    : 96;
  const bandImageMaxHeightPx = Math.max(20, Math.round((Number(activeBandHeightPx) || 96) * 0.72));
  const wordBandLayout = isWord && wordPageBands
    ? (() => {
        const { headerPct, footerPct } = getWordBandPercents(
          previewBandHeights.headerHeight,
          previewBandHeights.footerHeight,
        );
        const activeHeader = wordPageBands.activeBand !== "footer";
        return {
          headerPct,
          footerPct,
          activeHeader,
          bandPct: activeHeader ? headerPct : footerPct,
        };
      })()
    : null;

  const wordBandPercents = wordPageBands
    ? getWordBandPercents(previewBandHeights.headerHeight, previewBandHeights.footerHeight)
    : null;
  const bodyBandPct =
    wordBandPercents != null
      ? Math.max(8, 100 - wordBandPercents.headerPct - wordBandPercents.footerPct)
      : 0;

  const wordBandEditorVars = wordBandLayout
    ? ({
        "--word-band-image-max-height": `${bandImageMaxHeightPx}px`,
      } as React.CSSProperties)
    : undefined;

  const renderWordBandEditor = () => (
    <div
      ref={bandScrollRef}
      className="word-band-editor-scroll h-full overflow-visible [&_.tiptap]:!bg-transparent"
      style={wordBandEditorVars}
    >
      <TiptapEditorSurface editor={editor} />
    </div>
  );

  if (isWord) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
        {hiddenImageInput}
        <div className="relative z-30 shrink-0 border-b border-[#d0cece] bg-[#f3f2f1] shadow-[0_1px_0_#c6c6c6]">
            <div
              className="flex h-9 min-h-9 items-end gap-0 overflow-x-auto border-b border-neutral-200/80 bg-white px-0.5"
              role="tablist"
              aria-label="Faixa de opções"
            >
              {WORD_RIBBON_TABS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={wordRibbonTab === id}
                  onClick={() => setWordRibbonTab(id)}
                  className={cn(
                    "shrink-0 px-2 py-2 text-[11px] text-neutral-600 transition-colors hover:bg-neutral-100",
                    wordRibbonTab === id && "border-b-2 border-[#185abd] font-medium text-[#185abd]",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <fieldset disabled={readOnly} className="contents">
              {wordRibbonTab === "home" ? (
                <div className="flex flex-wrap items-start gap-3 bg-white px-2 py-2">
                  <div className="flex min-w-0 flex-col gap-1 border-r border-neutral-200 pr-3">
                    <span className="text-[10px] font-medium text-neutral-500">Fonte</span>
                    <div className="flex flex-wrap items-center gap-0.5">
                      {fontToolsBasic}
                      <div className="ml-1 flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => applyFontSize(fontSizePx - 1)}
                          title="Diminuir fonte"
                        >
                          A-
                        </Button>
                        <input
                          type="number"
                          min={8}
                          max={96}
                          value={fontSizePx}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (!Number.isFinite(n)) return;
                            setFontSizePx(clampFontSize(n));
                          }}
                          onBlur={(e) => {
                            const n = Number(e.target.value);
                            if (!Number.isFinite(n)) return;
                            applyFontSize(n);
                          }}
                          className="h-7 w-14 rounded border border-input bg-background px-2 text-[11px]"
                          aria-label="Tamanho da fonte (px)"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => applyFontSize(fontSizePx + 1)}
                          title="Aumentar fonte"
                        >
                          A+
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1 border-r border-neutral-200 pr-3">
                    <span className="text-[10px] font-medium text-neutral-500">Parágrafo</span>
                    <div className="flex flex-wrap gap-0.5">{paragraphTools}</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium text-neutral-500">Estilos</span>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 min-w-[72px] px-2 text-[10px] font-normal"
                        onClick={() => editor.chain().focus().clearNodes().setParagraph().run()}
                      >
                        Normal
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 min-w-[72px] px-2 text-[10px] font-semibold"
                        onClick={() => editor.chain().focus().clearNodes().toggleHeading({ level: 1 }).run()}
                      >
                        Título 1
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 min-w-[72px] px-2 text-[10px] font-semibold"
                        onClick={() => editor.chain().focus().clearNodes().toggleHeading({ level: 2 }).run()}
                      >
                        Título 2
                      </Button>
                    </div>
                  </div>
                </div>
              ) : wordRibbonTab === "insert" ? (
                <div className="flex flex-wrap items-end gap-x-6 gap-y-2 bg-white px-2 py-2">
                  {wordPageBands ? (
                    <div className="flex min-w-0 flex-col gap-1 border-r border-neutral-200 pr-4">
                      <span className="text-[10px] font-medium text-neutral-500">Cabeçalho e Rodapé</span>
                      <div className="flex h-7 min-h-7 items-center gap-1">
                        <Popover open={headerTemplateOpen} onOpenChange={setHeaderTemplateOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              type="button"
                              title="Modelos de cabeçalho"
                              className="h-7 w-auto max-w-none gap-1.5 px-2"
                            >
                              <PanelTop className="h-4 w-4 shrink-0" />
                              <span className="text-[11px]">Cabeçalho</span>
                              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-72 p-2">
                            <p className="px-1 pb-1 text-[11px] font-medium text-muted-foreground">Inserido</p>
                            <button
                              type="button"
                              className="w-full rounded-md border border-border bg-background p-2 text-left text-[11px] hover:bg-muted/50"
                              onClick={() => {
                                applyWordBandTemplate("header", "blank");
                                setHeaderTemplateOpen(false);
                              }}
                            >
                              <div className="mb-1 font-medium">Em Branco</div>
                              <div className="h-10 rounded border bg-white px-2 py-1 text-[10px] text-muted-foreground">
                                [Digite aqui]
                              </div>
                            </button>
                            <button
                              type="button"
                              className="mt-2 w-full rounded-md border border-border bg-background p-2 text-left text-[11px] hover:bg-muted/50"
                              onClick={() => {
                                applyWordBandTemplate("header", "blank_three_columns");
                                setHeaderTemplateOpen(false);
                              }}
                            >
                              <div className="font-medium">Em Branco (Três Colunas)</div>
                            </button>
                          </PopoverContent>
                        </Popover>
                        <Popover open={footerTemplateOpen} onOpenChange={setFooterTemplateOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              type="button"
                              title="Modelos de rodapé"
                              className="h-7 w-auto max-w-none gap-1.5 px-2"
                            >
                              <PanelBottom className="h-4 w-4 shrink-0" />
                              <span className="text-[11px]">Rodapé</span>
                              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-72 p-2">
                            <p className="px-1 pb-1 text-[11px] font-medium text-muted-foreground">Inserido</p>
                            <button
                              type="button"
                              className="w-full rounded-md border border-border bg-background p-2 text-left text-[11px] hover:bg-muted/50"
                              onClick={() => {
                                applyWordBandTemplate("footer", "blank");
                                setFooterTemplateOpen(false);
                              }}
                            >
                              <div className="mb-1 font-medium">Em Branco</div>
                              <div className="h-10 rounded border bg-white px-2 py-1 text-[10px] text-muted-foreground">
                                [Digite aqui]
                              </div>
                            </button>
                            <button
                              type="button"
                              className="mt-2 w-full rounded-md border border-border bg-background p-2 text-left text-[11px] hover:bg-muted/50"
                              onClick={() => {
                                applyWordBandTemplate("footer", "blank_three_columns");
                                setFooterTemplateOpen(false);
                              }}
                            >
                              <div className="font-medium">Em Branco (Três Colunas)</div>
                            </button>
                          </PopoverContent>
                        </Popover>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          title="Números de página são exibidos no rodapé"
                          onClick={() => focusWordBand("footer")}
                          className="h-7 w-auto max-w-none gap-1.5 px-2"
                        >
                          <Hash className="h-4 w-4 shrink-0" />
                          <span className="text-[11px]">Número de Página</span>
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {onUploadImage ? (
                    <div className="flex min-w-0 flex-col gap-1 border-r border-neutral-200 pr-4">
                      <span className="text-[10px] font-medium text-neutral-500">Ilustrações</span>
                      <div className="flex h-7 min-h-7 items-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          title="Inserir imagem do computador"
                          onClick={() => fileInputRef.current?.click()}
                          className="h-7 w-auto max-w-none gap-1.5 px-2"
                        >
                          <ImagePlus className="h-4 w-4 shrink-0" />
                          <span className="text-[11px]">Imagens</span>
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex min-w-0 flex-col gap-1 border-r border-neutral-200 pr-4">
                    <span className="text-[10px] font-medium text-neutral-500">Layout</span>
                    <div className="flex h-7 min-h-7 items-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        title="Inserir tabela 3 colunas para cabeçalho"
                        onClick={insertHeaderThreeColumns}
                        className="h-7 w-auto max-w-none gap-1.5 px-2"
                      >
                        <Table2 className="h-4 w-4 shrink-0" />
                        <span className="text-[11px]">3 colunas</span>
                      </Button>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1 border-r border-neutral-200 pr-4">
                    <span className="text-[10px] font-medium text-neutral-500">Variáveis</span>
                    <div className="flex h-7 min-h-7 items-center">{variableToolbarItem}</div>
                  </div>
                  {extraToolbarItems ? (
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-[10px] font-medium text-neutral-500">Outros</span>
                      <div className="flex h-7 min-h-7 flex-wrap items-center gap-1.5">{extraToolbarItems}</div>
                    </div>
                  ) : null}
                  {!onUploadImage && !extraToolbarItems ? (
                    <p className="px-1 py-1 text-[11px] text-neutral-500">
                      Nenhum recurso extra de inserção neste contexto. Você pode colar imagem com Ctrl+V quando o editor
                      permitir.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="px-3 py-2 text-[11px] leading-snug text-neutral-500">{wordRibbonOtherMessage}</p>
              )}
            </fieldset>
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-auto bg-[#e7e6e6] px-2 py-6 sm:px-4">
            <div
              className="mx-auto box-border max-w-full"
              style={{
                display: "grid",
                width: "min(calc(210mm + 1.5rem), 100%)",
                gridTemplateColumns: "1.5rem minmax(0, min(210mm, calc(100% - 1.5rem)))",
                gridTemplateRows: "1.5rem auto",
                columnGap: 0,
                rowGap: 0,
              }}
            >
              <div className="col-start-1 row-start-1">
                <RulerCorner />
              </div>
              <div className="col-start-2 row-start-1 min-w-0">
                <RulerHorizontal className="w-full" />
              </div>
              <div className="col-start-1 row-start-2 flex w-6 shrink-0 self-stretch">
                <RulerVertical className="min-h-0 flex-1" />
              </div>
              <div
                ref={wordPaperRef}
                className={cn(
                  "relative col-start-2 row-start-2 box-border flex min-w-0 flex-col self-start overflow-x-hidden border border-l-0 border-t-0 border-neutral-500/45 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.12)]",
                )}
                onClickCapture={(e) => {
                  if (!wordPageBands?.onSelectBand) return;
                  const paper = wordPaperRef.current;
                  if (!paper) return;
                  const rect = paper.getBoundingClientRect();
                  if (rect.height <= 0) return;
                  const yPct = ((e.clientY - rect.top) / rect.height) * 100;
                  const { headerPct, footerPct } = getWordBandPercents(
                    previewBandHeights.headerHeight,
                    previewBandHeights.footerHeight,
                  );
                  if (yPct <= headerPct) {
                    wordPageBands.onSelectBand("header");
                  } else if (yPct >= 100 - footerPct) {
                    wordPageBands.onSelectBand("footer");
                  }
                }}
                onDoubleClickCapture={(e) => {
                  if (!wordPageBands?.onSelectBand) return;
                  const paper = wordPaperRef.current;
                  if (!paper) return;
                  const rect = paper.getBoundingClientRect();
                  if (rect.height <= 0) return;
                  const yPct = ((e.clientY - rect.top) / rect.height) * 100;
                  const { headerPct, footerPct } = getWordBandPercents(
                    previewBandHeights.headerHeight,
                    previewBandHeights.footerHeight,
                  );
                  if (yPct <= headerPct) {
                    wordPageBands.onSelectBand("header");
                    focusWordEditorSelectAll();
                  } else if (yPct >= 100 - footerPct) {
                    wordPageBands.onSelectBand("footer");
                    focusWordEditorSelectAll();
                  }
                }}
                style={{
                  width: "100%",
                  aspectRatio: "210 / 297",
                }}
              >
                {isWord && wordPageBottomLeftText?.trim() ? (
                  <div
                    className="pointer-events-none absolute z-[30] select-none text-[9pt] leading-snug text-neutral-700"
                    style={{ left: "22mm", bottom: "18mm" }}
                    aria-hidden
                  >
                    {wordPageBottomLeftText.trim()}
                  </div>
                ) : null}
                {wordPageWatermarkUrl?.trim() ? (
                  wordPageWatermarkLayout ? (
                    <WordPageWatermark
                      url={wordPageWatermarkUrl.trim()}
                      opacity={Math.min(
                        0.35,
                        Math.max(0, Number.isFinite(wordPageWatermarkOpacity) ? wordPageWatermarkOpacity : 0.12),
                      )}
                      readOnly={wordPageWatermarkLayout.readOnly}
                      paperRef={wordPaperRef}
                      xPct={wordPageWatermarkLayout.xPct}
                      yPct={wordPageWatermarkLayout.yPct}
                      widthPct={wordPageWatermarkLayout.widthPct}
                      aspect={wordPageWatermarkLayout.aspect}
                      onLayoutChange={wordPageWatermarkLayout.onLayoutChange}
                      onAspectChange={wordPageWatermarkLayout.onAspectChange}
                    />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={wordPageWatermarkUrl.trim()}
                      alt=""
                      className="pointer-events-none absolute inset-0 z-0 m-auto max-h-[78%] max-w-[78%] object-contain"
                      style={{
                        opacity: Math.min(
                          0.32,
                          Math.max(0, Number.isFinite(wordPageWatermarkOpacity) ? wordPageWatermarkOpacity : 0.12),
                        ),
                        transform: `scale(${Math.max(20, Math.min(240, Number(wordPageWatermarkScalePct) || 100)) / 100})`,
                      }}
                    />
                  )
                ) : null}
                {wordPageClientLogo?.url?.trim() ? (
                  <WordPageClientLogo
                    url={wordPageClientLogo.url.trim()}
                    readOnly={wordPageClientLogo.readOnly}
                    paperRef={wordPaperRef}
                    xPct={wordPageClientLogo.xPct}
                    yPct={wordPageClientLogo.yPct}
                    widthPct={wordPageClientLogo.widthPct}
                    aspect={wordPageClientLogo.aspect}
                    onLayoutChange={wordPageClientLogo.onLayoutChange}
                    onAspectChange={wordPageClientLogo.onAspectChange}
                  />
                ) : null}
                {wordPageBands && wordBandPercents ? (
                  <>
                    <div
                      className={cn(
                        "relative z-[20] shrink-0 overflow-visible bg-white",
                        wordPageBands.activeBand === "header" &&
                          "ring-1 ring-inset ring-primary/50",
                      )}
                      style={{ height: `${wordBandPercents.headerPct}%` }}
                      onPointerDown={(e) => {
                        if (e.target === e.currentTarget) focusWordBand("header");
                      }}
                    >
                      {wordPageBands.activeBand === "header" ? renderWordBandEditor() : null}
                    </div>
                    <div
                      className="relative z-0 shrink-0 bg-white"
                      style={{ height: `${bodyBandPct}%` }}
                      aria-hidden
                    />
                    <div
                      className={cn(
                        "relative z-[20] shrink-0 overflow-visible bg-white",
                        wordPageBands.activeBand === "footer" &&
                          "ring-1 ring-inset ring-primary/50",
                      )}
                      style={{ height: `${wordBandPercents.footerPct}%` }}
                      onPointerDown={(e) => {
                        if (e.target === e.currentTarget) focusWordBand("footer");
                      }}
                    >
                      {wordPageBands.activeBand === "footer" ? renderWordBandEditor() : null}
                    </div>
                    <div className="pointer-events-none absolute inset-0 z-[35]" aria-hidden>
                    {(() => {
                      const { headerPct, footerPct, bodyStart, bodyEnd } = wordBandPercents;
                      const activeHeader = wordPageBands.activeBand === "header";
                      const activeFooter = wordPageBands.activeBand === "footer";
                      const resizeHandleClass =
                        "pointer-events-auto absolute left-0 right-0 z-[40] flex h-7 -translate-y-1/2 cursor-ns-resize touch-none items-center justify-center";
                      const resizeGripClass =
                        "flex h-5 w-10 items-center justify-center rounded-full border border-primary/45 bg-white/95 text-primary shadow-sm transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground";
                      return (
                        <>
                          <div
                            className={cn(
                              "pointer-events-none absolute left-0 right-0 top-0 border-b border-dashed transition-colors",
                              activeHeader ? "border-primary/70" : "border-neutral-300/80",
                            )}
                            style={{ height: `${headerPct}%` }}
                          />
                          <div
                            className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-neutral-300/70"
                            style={{ top: `${bodyStart}%` }}
                          />
                          {wordPageBands.onHeaderHeightChange ? (
                            <button
                              type="button"
                              aria-label="Redimensionar cabeçalho"
                              title="Redimensionar cabeçalho"
                              className={resizeHandleClass}
                              style={{ top: `${bodyStart}%` }}
                              onPointerDownCapture={startBandResize("header")}
                            >
                              <span className={resizeGripClass}>
                                <GripHorizontal className="h-3.5 w-3.5" aria-hidden />
                              </span>
                            </button>
                          ) : null}
                          <div
                            className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-neutral-300/70"
                            style={{ top: `${bodyEnd}%` }}
                          />
                          {wordPageBands.onFooterHeightChange ? (
                            <button
                              type="button"
                              aria-label="Redimensionar rodapé"
                              title="Redimensionar rodapé"
                              className={resizeHandleClass}
                              style={{ top: `${bodyEnd}%` }}
                              onPointerDownCapture={startBandResize("footer")}
                            >
                              <span className={resizeGripClass}>
                                <GripHorizontal className="h-3.5 w-3.5" aria-hidden />
                              </span>
                            </button>
                          ) : null}
                          <div
                            className={cn(
                              "pointer-events-none absolute left-0 right-0 bottom-0 border-t border-dashed transition-colors",
                              activeFooter ? "border-primary/70" : "border-neutral-300/80",
                            )}
                            style={{ height: `${footerPct}%` }}
                          />
                          <div className="pointer-events-none absolute left-2 top-1 rounded-sm bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">
                            Cabeçalho
                          </div>
                          <div
                            className="pointer-events-none absolute left-2 rounded-sm bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm"
                            style={{ top: `calc(${bodyStart}% + 2px)` }}
                          >
                            Corpo
                          </div>
                          <div className="pointer-events-none absolute left-2 bottom-1 rounded-sm bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">
                            Rodapé
                          </div>
                        </>
                      );
                    })()}
                    </div>
                  </>
                ) : (
                  <div className="relative z-0 min-h-full flex-1 [&_.tiptap]:!bg-transparent [&_.tiptap]:min-h-full">
                    <TiptapEditorSurface editor={editor} />
                  </div>
                )}
              </div>
            </div>
          </div>
      </div>
    );
  }

  return (
    <>
      {hiddenImageInput}
      <div className="space-y-2">
        <fieldset disabled={readOnly} className="contents">
          <div className="flex flex-wrap gap-2 rounded-md border bg-muted/20 p-2">
            {onUploadImage ? (
              allTools
            ) : (
              <>
                {fontTools}
                <div className="my-auto h-6 w-px bg-border" />
                {paragraphTools}
              </>
            )}
          </div>
        </fieldset>
        <TiptapEditorSurface editor={editor} className="[&_.tiptap-content]:min-h-[300px]" />
      </div>
    </>
  );
}

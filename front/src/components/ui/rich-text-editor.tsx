
"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ResizableImage } from '@/components/ui/resizable-image-extension';
import TextAlign from '@tiptap/extension-text-align';
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Heading1, Heading2, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  ImagePlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  onUploadImage?: (file: File) => Promise<string>;
  extraToolbarItems?: React.ReactNode;
  onEditorReady?: (insertImage: (url: string) => void) => void;
  /** Faixa tipo Microsoft Word (abas + grupos Fonte / Parágrafo / Estilos). */
  variant?: 'default' | 'word';
  readOnly?: boolean;
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
  variant = 'default',
  readOnly = false,
}: RichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [wordRibbonTab, setWordRibbonTab] = useState<WordRibbonTabId>("home");

  const isWord = variant === 'word';

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      ResizableImage.configure({ inline: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'], defaultAlignment: isWord ? 'left' : 'justify' }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    onCreate: ({ editor }) => {
      if (onEditorReady) {
        onEditorReady((url: string) => {
          editor.chain().focus().setImage({ src: url }).run();
        });
      }
    },
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (event.key === 'Tab') {
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
                editor?.chain().focus().setImage({ src: url }).run();
              }).catch(() => {});
            } else {
              const reader = new FileReader();
              reader.onload = (e) => {
                const dataUrl = e.target?.result as string;
                if (dataUrl) editor?.chain().focus().setImage({ src: dataUrl }).run();
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
            ? "min-h-full px-[22mm] py-[18mm] text-[11pt] leading-relaxed"
            : "min-h-[300px] p-4 border rounded-md text-justify",
        ),
      },
    },
  }, [isWord, readOnly]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  if (!editor) return null;

  const wc = isWord ? 'h-7 w-7 p-0' : undefined;

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
        editor.chain().focus().setImage({ src: url }).run();
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
                    <div className="flex flex-wrap gap-0.5">{fontToolsBasic}</div>
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
                className={cn(
                  "col-start-2 row-start-2 box-border min-w-0 self-start overflow-x-hidden border border-l-0 border-t-0 border-neutral-500/45 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.12)]",
                )}
                style={{
                  width: "100%",
                  aspectRatio: "210 / 297",
                }}
              >
                <EditorContent editor={editor} />
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
        <EditorContent editor={editor} />
      </div>
    </>
  );
}

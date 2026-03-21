
"use client";

import { useRef } from "react";
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

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  onUploadImage?: (file: File) => Promise<string>;
  extraToolbarItems?: React.ReactNode;
  onEditorReady?: (insertImage: (url: string) => void) => void;
}

export function RichTextEditor({
  value,
  onChange,
  onUploadImage,
  extraToolbarItems,
  onEditorReady,
}: RichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      ResizableImage.configure({ inline: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'], defaultAlignment: 'justify' }),
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
        class: 'tiptap-content focus:outline-none min-h-[300px] p-4 border rounded-md text-justify',
      },
    },
  });

  if (!editor) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 border p-2 rounded-md bg-muted/20">
        <Button
          variant={editor.isActive('bold') ? 'default' : 'ghost'}
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          type="button"
        >
          <Bold className="w-4 h-4" />
        </Button>
        <Button
          variant={editor.isActive('italic') ? 'default' : 'ghost'}
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          type="button"
        >
          <Italic className="w-4 h-4" />
        </Button>
        <Button
          variant={editor.isActive('underline') ? 'default' : 'ghost'}
          size="sm"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          type="button"
        >
          <UnderlineIcon className="w-4 h-4" />
        </Button>
        <div className="w-px bg-border h-6 my-auto" />
        <Button
          variant={editor.isActive('heading', { level: 1 }) ? 'default' : 'ghost'}
          size="sm"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          type="button"
        >
          <Heading1 className="w-4 h-4" />
        </Button>
        <Button
          variant={editor.isActive('heading', { level: 2 }) ? 'default' : 'ghost'}
          size="sm"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          type="button"
        >
          <Heading2 className="w-4 h-4" />
        </Button>
        <div className="w-px bg-border h-6 my-auto" />
        <Button
          variant={editor.isActive('bulletList') ? 'default' : 'ghost'}
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          type="button"
        >
          <List className="w-4 h-4" />
        </Button>
        <Button
          variant={editor.isActive('orderedList') ? 'default' : 'ghost'}
          size="sm"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          type="button"
        >
          <ListOrdered className="w-4 h-4" />
        </Button>
        <div className="w-px bg-border h-6 my-auto" />
        <Button
          variant={editor.isActive({ textAlign: 'left' }) ? 'default' : 'ghost'}
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          type="button"
          title="Alinhar à esquerda"
        >
          <AlignLeft className="w-4 h-4" />
        </Button>
        <Button
          variant={editor.isActive({ textAlign: 'center' }) ? 'default' : 'ghost'}
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          type="button"
          title="Centralizar"
        >
          <AlignCenter className="w-4 h-4" />
        </Button>
        <Button
          variant={editor.isActive({ textAlign: 'right' }) ? 'default' : 'ghost'}
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          type="button"
          title="Alinhar à direita"
        >
          <AlignRight className="w-4 h-4" />
        </Button>
        <Button
          variant={editor.isActive({ textAlign: 'justify' }) ? 'default' : 'ghost'}
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          type="button"
          title="Justificar"
        >
          <AlignJustify className="w-4 h-4" />
        </Button>
        {onUploadImage && (
          <>
            <div className="w-px bg-border h-6 my-auto" />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !onUploadImage) return;
                const url = await onUploadImage(file);
                editor.chain().focus().setImage({ src: url }).run();
                e.target.value = '';
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              type="button"
              title="Inserir imagem"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="w-4 h-4" />
            </Button>
          </>
        )}
        {extraToolbarItems}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

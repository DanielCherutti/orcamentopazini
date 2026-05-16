"use client";

import { useRef } from "react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import Image from "@tiptap/extension-image";
import type { NodeViewProps } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";

type HandleDir = "nw" | "ne" | "se" | "sw";

const HANDLE_STYLE: Record<HandleDir, React.CSSProperties> = {
  nw: { top: -5, left: -5, cursor: "nw-resize" },
  ne: { top: -5, right: -5, cursor: "ne-resize" },
  se: { bottom: -5, right: -5, cursor: "se-resize" },
  sw: { bottom: -5, left: -5, cursor: "sw-resize" },
};

function ResizableImageComponent({ node, selected, updateAttributes, editor, getPos }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);

  const width: number | null = node.attrs.width ?? null;
  const height: number | null = node.attrs.height ?? null;
  const floating = Boolean(node.attrs.floating);
  const showHandles = selected || floating;
  const x = Number(node.attrs.x ?? 8);
  const y = Number(node.attrs.y ?? 8);

  function startMove(e: React.MouseEvent) {
    if (!floating) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = x;
    const startTop = y;

    function onMouseMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      updateAttributes({
        x: Math.max(0, Math.round(startLeft + dx)),
        y: Math.max(0, Math.round(startTop + dy)),
      });
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function selectNodeOnClick(e: React.MouseEvent) {
    e.stopPropagation();
    const pos = typeof getPos === "function" ? getPos() : null;
    if (!editor || typeof pos !== "number") return;
    const { state, view } = editor;
    view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
    view.focus();
  }

  function startResize(dir: HandleDir) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      const startW = imgRef.current?.offsetWidth ?? (width ?? 300);
      const startH = imgRef.current?.offsetHeight ?? (height ?? 200);

      function onMouseMove(ev: MouseEvent) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const updates: Record<string, number> = {};

        if (dir.includes("e")) updates.width  = Math.max(50, startW + dx);
        if (dir.includes("w")) updates.width  = Math.max(50, startW - dx);
        if (dir.includes("s")) updates.height = Math.max(30, startH + dy);
        if (dir.includes("n")) updates.height = Math.max(30, startH - dy);

        updateAttributes(updates);
      }

      function onMouseUp() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };
  }

  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      style={{
        display: floating ? "inline-flex" : "inline-block",
        position: floating ? "absolute" : "relative",
        left: floating ? `${x}px` : undefined,
        top: floating ? `${y}px` : undefined,
        zIndex: floating ? 30 : undefined,
        width:  width  ? `${width}px`  : "auto",
        height: height ? `${height}px` : "auto",
        maxWidth: floating ? undefined : "100%",
        boxShadow: selected ? "0 0 0 2px #06b6d4" : undefined,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        data-drag-handle=""
        data-floating={floating ? "true" : undefined}
        src={node.attrs.src}
        alt={node.attrs.alt ?? ""}
        title={node.attrs.title ?? undefined}
        draggable={false}
        onClick={selectNodeOnClick}
        onMouseDown={startMove}
        style={{
          display: "block",
          width: "100%",
          height: height ? "100%" : "auto",
          objectFit: "fill",
          cursor: floating ? "move" : "grab",
          userSelect: "none",
        }}
      />
      {showHandles &&
        (Object.keys(HANDLE_STYLE) as HandleDir[]).map((dir) => (
          <span
            key={dir}
            onMouseDown={startResize(dir)}
            style={{
              position: "absolute",
              width: 9,
              height: 9,
              background: "#06b6d4",
              border: "1.5px solid white",
              borderRadius: 1,
              ...HANDLE_STYLE[dir],
            }}
          />
        ))}
    </NodeViewWrapper>
  );
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML(el) {
          const v = el.getAttribute("width") || (el as HTMLElement).style.width;
          return v ? parseInt(v, 10) || null : null;
        },
        renderHTML(attrs) {
          const parts: string[] = [];
          if (attrs.width)  parts.push(`width: ${attrs.width}px`);
          if (attrs.height) parts.push(`height: ${attrs.height}px`);
          const ret: Record<string, string> = {};
          if (attrs.width)  ret.width  = String(attrs.width);
          if (attrs.height) ret.height = String(attrs.height);
          if (parts.length) ret.style  = parts.join("; ");
          return ret;
        },
      },
      height: {
        default: null,
        parseHTML(el) {
          const v = el.getAttribute("height") || (el as HTMLElement).style.height;
          return v ? parseInt(v, 10) || null : null;
        },
        renderHTML() {
          // Serialization handled by width's renderHTML to avoid style conflicts
          return {};
        },
      },
      floating: {
        default: false,
        parseHTML(el) {
          const flag = el.getAttribute("data-floating");
          return flag === "true";
        },
        renderHTML(attrs) {
          return attrs.floating ? { "data-floating": "true" } : {};
        },
      },
      x: {
        default: null,
        parseHTML(el) {
          const v = el.getAttribute("data-x");
          return v ? Number(v) || null : null;
        },
        renderHTML(attrs) {
          return attrs.floating && Number.isFinite(attrs.x)
            ? { "data-x": String(Math.round(Number(attrs.x))) }
            : {};
        },
      },
      y: {
        default: null,
        parseHTML(el) {
          const v = el.getAttribute("data-y");
          return v ? Number(v) || null : null;
        },
        renderHTML(attrs) {
          return attrs.floating && Number.isFinite(attrs.y)
            ? { "data-y": String(Math.round(Number(attrs.y))) }
            : {};
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});

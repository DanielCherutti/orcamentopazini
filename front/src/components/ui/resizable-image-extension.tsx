"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import Image from "@tiptap/extension-image";
import type { NodeViewProps } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";

declare module "@tiptap/extension-image" {
  interface SetImageOptions {
    floating?: boolean;
    x?: number;
    y?: number;
  }
}

type HandleDir = "nw" | "ne" | "se" | "sw";

const HANDLE_STYLE: Record<HandleDir, React.CSSProperties> = {
  nw: { top: -5, left: -5, cursor: "nw-resize" },
  ne: { top: -5, right: -5, cursor: "ne-resize" },
  se: { bottom: -5, right: -5, cursor: "se-resize" },
  sw: { bottom: -5, left: -5, cursor: "sw-resize" },
};

function getWordBandOverlayRoot(editor: NodeViewProps["editor"]): HTMLElement | null {
  if (!editor) return null;
  return (
    editor.view.dom.closest<HTMLElement>(".word-band-editor-scroll") ??
    editor.view.dom.closest<HTMLElement>(".tiptap-content.word-band-mode")
  );
}

function ResizableImageComponent({ node, selected, updateAttributes, editor, getPos }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);

  const width: number | null = node.attrs.width ?? null;
  const height: number | null = node.attrs.height ?? null;
  const floating = Boolean(node.attrs.floating);
  const inWordBand = Boolean(editor?.view.dom.closest(".word-band-mode"));
  const useBandOverlay = inWordBand;
  const showHandles = selected || floating || useBandOverlay;
  const x = Number(node.attrs.x ?? 8);
  const y = Number(node.attrs.y ?? 8);
  const [draftRect, setDraftRect] = useState({
    x,
    y,
    width,
    height,
  });

  useEffect(() => {
    setDraftRect({ x, y, width, height });
  }, [x, y, width, height]);

  useEffect(() => {
    if (!useBandOverlay) {
      setOverlayRoot(null);
      return;
    }
    setOverlayRoot(getWordBandOverlayRoot(editor));
  }, [editor, useBandOverlay]);

  function startMove(e: React.PointerEvent) {
    if (!floating && !inWordBand) return;
    e.preventDefault();
    e.stopPropagation();

    const pointerId = e.pointerId;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(pointerId);

    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = draftRect.x;
    const startTop = draftRect.y;
    let nextX = startLeft;
    let nextY = startTop;

    function onPointerMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      nextX = Math.max(0, Math.round(startLeft + dx));
      nextY = Math.max(0, Math.round(startTop + dy));
      setDraftRect((prev) => ({
        ...prev,
        x: nextX,
        y: nextY,
      }));
    }

    function onPointerUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      target.releasePointerCapture(pointerId);
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", onPointerUp);
      target.removeEventListener("pointercancel", onPointerUp);
      updateAttributes({
        x: nextX,
        y: nextY,
        floating: true,
        width: draftRect.width ?? 96,
      });
    }

    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp);
    target.addEventListener("pointercancel", onPointerUp);
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
      let nextWidth = startW;
      let nextHeight = startH;

      function onMouseMove(ev: MouseEvent) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        if (dir.includes("e")) nextWidth = Math.max(50, startW + dx);
        if (dir.includes("w")) nextWidth = Math.max(50, startW - dx);
        if (dir.includes("s")) nextHeight = Math.max(30, startH + dy);
        if (dir.includes("n")) nextHeight = Math.max(30, startH - dy);

        setDraftRect((prev) => ({
          ...prev,
          width: Math.round(nextWidth),
          height: Math.round(nextHeight),
        }));
      }

      function onMouseUp() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        updateAttributes({
          width: Math.round(nextWidth),
          height: Math.round(nextHeight),
          floating: true,
        });
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };
  }

  const frameStyle: React.CSSProperties = {
    position: "absolute",
    left: `${draftRect.x}px`,
    top: `${draftRect.y}px`,
    zIndex: 50,
    width: draftRect.width ? `${draftRect.width}px` : "auto",
    height: draftRect.height ? `${draftRect.height}px` : "auto",
    boxShadow: selected ? "0 0 0 2px #06b6d4" : undefined,
    pointerEvents: "auto",
  };

  const imageFrame = (
    <div
      contentEditable={false}
      data-floating-overlay="true"
      style={useBandOverlay ? frameStyle : undefined}
      className={useBandOverlay ? "word-floating-overlay" : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        data-drag-handle=""
        data-floating={floating || useBandOverlay ? "true" : undefined}
        src={node.attrs.src}
        alt={node.attrs.alt ?? ""}
        title={node.attrs.title ?? undefined}
        draggable={false}
        onClick={selectNodeOnClick}
        onPointerDown={startMove}
        style={{
          display: "block",
          width: "100%",
          height: draftRect.height ? "100%" : "auto",
          objectFit: "fill",
          cursor: floating || useBandOverlay ? "move" : "grab",
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
    </div>
  );

  if (useBandOverlay && overlayRoot) {
    return (
      <>
        <NodeViewWrapper
          as="span"
          contentEditable={false}
          className="word-floating-slot"
          data-floating-slot="true"
        >
          <span aria-hidden className="sr-only">imagem flutuante</span>
        </NodeViewWrapper>
        {createPortal(imageFrame, overlayRoot)}
      </>
    );
  }

  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      data-floating-wrapper={floating ? "true" : undefined}
      style={{
        display: floating ? "inline-flex" : "inline-block",
        position: floating ? "absolute" : "relative",
        left: floating ? `${draftRect.x}px` : undefined,
        top: floating ? `${draftRect.y}px` : undefined,
        zIndex: floating ? 40 : undefined,
        pointerEvents: floating ? "auto" : undefined,
        width: draftRect.width ? `${draftRect.width}px` : "auto",
        height: draftRect.height ? `${draftRect.height}px` : "auto",
        maxWidth: floating ? undefined : "100%",
        boxShadow: selected ? "0 0 0 2px #06b6d4" : undefined,
      }}
    >
      {imageFrame}
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
          const widthNum = Number(attrs.width);
          const heightNum = Number(attrs.height);
          if (Number.isFinite(widthNum) && widthNum > 0) parts.push(`width: ${Math.round(widthNum)}px`);
          if (Number.isFinite(heightNum) && heightNum > 0) parts.push(`height: ${Math.round(heightNum)}px`);
          if (attrs.floating) {
            const xNum = Number(attrs.x);
            const yNum = Number(attrs.y);
            parts.push("position: absolute");
            parts.push(`left: ${Number.isFinite(xNum) ? Math.round(xNum) : 8}px`);
            parts.push(`top: ${Number.isFinite(yNum) ? Math.round(yNum) : 8}px`);
            parts.push("z-index: 30");
          }
          const ret: Record<string, string> = {};
          if (Number.isFinite(widthNum) && widthNum > 0) ret.width = String(Math.round(widthNum));
          if (Number.isFinite(heightNum) && heightNum > 0) ret.height = String(Math.round(heightNum));
          if (parts.length) ret.style = parts.join("; ");
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
          return {};
        },
      },
      floating: {
        default: false,
        parseHTML(el) {
          const flag = el.getAttribute("data-floating");
          if (flag === "true") return true;
          const stylePos = (el as HTMLElement).style.position || "";
          return stylePos.toLowerCase() === "absolute";
        },
        renderHTML(attrs) {
          return attrs.floating ? { "data-floating": "true" } : {};
        },
      },
      x: {
        default: null,
        parseHTML(el) {
          const v = el.getAttribute("data-x");
          if (v != null) {
            const n = Number(v);
            if (Number.isFinite(n)) return n;
          }
          const styleLeft = (el as HTMLElement).style.left || "";
          const parsed = parseInt(styleLeft.replace(/[^\d.-]/g, ""), 10);
          return Number.isFinite(parsed) ? parsed : null;
        },
        renderHTML(attrs) {
          const xNum = Number(attrs.x);
          return attrs.floating && Number.isFinite(xNum)
            ? { "data-x": String(Math.round(xNum)) }
            : {};
        },
      },
      y: {
        default: null,
        parseHTML(el) {
          const v = el.getAttribute("data-y");
          if (v != null) {
            const n = Number(v);
            if (Number.isFinite(n)) return n;
          }
          const styleTop = (el as HTMLElement).style.top || "";
          const parsed = parseInt(styleTop.replace(/[^\d.-]/g, ""), 10);
          return Number.isFinite(parsed) ? parsed : null;
        },
        renderHTML(attrs) {
          const yNum = Number(attrs.y);
          return attrs.floating && Number.isFinite(yNum)
            ? { "data-y": String(Math.round(yNum)) }
            : {};
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});

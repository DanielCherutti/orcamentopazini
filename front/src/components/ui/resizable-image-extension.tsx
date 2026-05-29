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
    naturalWidth?: number;
    naturalHeight?: number;
    imageAlign?: "left" | "center" | "right";
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
  const naturalWidth = Number(node.attrs.naturalWidth ?? 0);
  const naturalHeight = Number(node.attrs.naturalHeight ?? 0);
  const floating = Boolean(node.attrs.floating);
  const inWordBand = Boolean(editor?.view.dom.closest(".word-band-mode"));
  const useBandOverlay = inWordBand;
  const effectiveFloating = floating && inWordBand;
  const imageAlign = (node.attrs.imageAlign === "left" || node.attrs.imageAlign === "right")
    ? node.attrs.imageAlign
    : "center";
  const showHandles = selected || effectiveFloating || useBandOverlay;
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

  useEffect(() => {
    if (inWordBand || !floating) return;
    updateAttributes({ floating: false, x: null, y: null });
  }, [floating, inWordBand, updateAttributes]);

  function startMove(e: React.PointerEvent) {
    if (!effectiveFloating && !inWordBand) return;
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
      const aspect =
        naturalWidth > 0 && naturalHeight > 0
          ? naturalWidth / naturalHeight
          : startW > 0 && startH > 0
            ? startW / startH
            : 1;
      let nextWidth = startW;
      let nextHeight = startH;

      function onMouseMove(ev: MouseEvent) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        const rawWidth = dir.includes("e") ? startW + dx : startW - dx;
        const rawHeight = dir.includes("s") ? startH + dy : startH - dy;

        if (ev.shiftKey) {
          const widthFromPointer = Math.max(50, rawWidth);
          const heightFromPointer = Math.max(30, rawHeight);
          const horizontalDelta = Math.abs(widthFromPointer - startW);
          const verticalDelta = Math.abs(heightFromPointer - startH);
          if (horizontalDelta >= verticalDelta) {
            nextWidth = widthFromPointer;
            nextHeight = Math.max(30, nextWidth / aspect);
          } else {
            nextHeight = heightFromPointer;
            nextWidth = Math.max(50, nextHeight * aspect);
          }
        } else {
          if (dir.includes("e") || dir.includes("w")) nextWidth = Math.max(50, rawWidth);
          if (dir.includes("s") || dir.includes("n")) nextHeight = Math.max(30, rawHeight);
        }

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
          ...(inWordBand ? { floating: true } : { floating: false }),
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
  const flowFrameStyle: React.CSSProperties = {
    position: "relative",
    width: draftRect.width ? `${draftRect.width}px` : "auto",
    height: draftRect.height ? `${draftRect.height}px` : "auto",
    maxWidth: "100%",
  };

  const imageFrame = (
    <div
      contentEditable={false}
      data-floating-overlay="true"
      style={useBandOverlay ? frameStyle : flowFrameStyle}
      className={useBandOverlay ? "word-floating-overlay" : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        data-drag-handle=""
        data-floating={effectiveFloating || useBandOverlay ? "true" : undefined}
        data-image-align={imageAlign}
        src={node.attrs.src}
        alt={node.attrs.alt ?? ""}
        title={node.attrs.title ?? undefined}
        draggable={false}
        onLoad={(event) => {
          const image = event.currentTarget;
          if (!naturalWidth && !naturalHeight && image.naturalWidth > 0 && image.naturalHeight > 0) {
            updateAttributes({
              naturalWidth: image.naturalWidth,
              naturalHeight: image.naturalHeight,
            });
          }
        }}
        onClick={selectNodeOnClick}
        onPointerDown={startMove}
        style={{
          display: "block",
          width: "100%",
          height: draftRect.height ? "100%" : "auto",
          objectFit: "contain",
          cursor: effectiveFloating || useBandOverlay ? "move" : "default",
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
        display: effectiveFloating ? "inline-flex" : "flex",
        justifyContent:
          !effectiveFloating && imageAlign === "left"
            ? "flex-start"
            : !effectiveFloating && imageAlign === "right"
              ? "flex-end"
              : "center",
        position: effectiveFloating ? "absolute" : "relative",
        left: effectiveFloating ? `${draftRect.x}px` : undefined,
        top: effectiveFloating ? `${draftRect.y}px` : undefined,
        zIndex: effectiveFloating ? 40 : undefined,
        pointerEvents: effectiveFloating ? "auto" : undefined,
        width: effectiveFloating ? (draftRect.width ? `${draftRect.width}px` : "auto") : "100%",
        height: effectiveFloating ? (draftRect.height ? `${draftRect.height}px` : "auto") : "auto",
        maxWidth: effectiveFloating ? undefined : "100%",
        marginTop: effectiveFloating ? undefined : 8,
        marginBottom: effectiveFloating ? undefined : 8,
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
      naturalWidth: {
        default: null,
        parseHTML(el) {
          const v = el.getAttribute("data-natural-width");
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? n : null;
        },
        renderHTML(attrs) {
          const n = Number(attrs.naturalWidth);
          return Number.isFinite(n) && n > 0
            ? { "data-natural-width": String(Math.round(n)) }
            : {};
        },
      },
      naturalHeight: {
        default: null,
        parseHTML(el) {
          const v = el.getAttribute("data-natural-height");
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? n : null;
        },
        renderHTML(attrs) {
          const n = Number(attrs.naturalHeight);
          return Number.isFinite(n) && n > 0
            ? { "data-natural-height": String(Math.round(n)) }
            : {};
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
      imageAlign: {
        default: "center",
        parseHTML(el) {
          const data = el.getAttribute("data-image-align");
          if (data === "left" || data === "center" || data === "right") return data;
          const style = (el as HTMLElement).style;
          if (style.marginLeft === "auto" && style.marginRight === "auto") return "center";
          if (style.marginLeft === "auto") return "right";
          if (style.marginRight === "auto") return "left";
          return "center";
        },
        renderHTML(attrs) {
          const align = attrs.imageAlign === "left" || attrs.imageAlign === "right"
            ? attrs.imageAlign
            : "center";
          const style =
            align === "left"
              ? "display: block; margin-left: 0; margin-right: auto"
              : align === "right"
                ? "display: block; margin-left: auto; margin-right: 0"
                : "display: block; margin-left: auto; margin-right: auto";
          return { "data-image-align": align, style };
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

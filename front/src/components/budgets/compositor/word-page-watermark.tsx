"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function clampWatermarkLayout(
  layout: { xPct: number; yPct: number; widthPct: number },
  paperW: number,
  paperH: number,
  aspect: number,
): { xPct: number; yPct: number; widthPct: number } {
  const widthPct = clamp(layout.widthPct, 8, 95);
  const wPx = (widthPct / 100) * paperW;
  const hPx = wPx / aspect;
  const maxXPct = clamp(100 - (wPx / paperW) * 100, 0, 100);
  const maxYPct = clamp(100 - (hPx / paperH) * 100, 0, 100);
  return {
    widthPct,
    xPct: clamp(layout.xPct, 0, maxXPct),
    yPct: clamp(layout.yPct, 0, maxYPct),
  };
}

export function WordPageWatermark({
  url,
  opacity,
  readOnly,
  paperRef,
  xPct,
  yPct,
  widthPct,
  aspect,
  onLayoutChange,
  onAspectChange,
}: {
  url: string;
  opacity: number;
  readOnly: boolean;
  paperRef: React.RefObject<HTMLElement | null>;
  xPct: number;
  yPct: number;
  widthPct: number;
  aspect: number | undefined;
  onLayoutChange: (next: { xPct: number; yPct: number; widthPct: number }) => void;
  onAspectChange: (aspect: number) => void;
}) {
  const effectiveAspect = aspect && aspect > 0 ? aspect : 1;
  const [local, setLocal] = useState({ xPct, yPct, widthPct });
  const localRef = useRef(local);
  const drag = useRef<{
    kind: "move" | "resize";
    startX: number;
    startY: number;
    start: { xPct: number; yPct: number; widthPct: number };
  } | null>(null);

  useEffect(() => {
    localRef.current = local;
  }, [local]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal({ xPct, yPct, widthPct });
  }, [xPct, yPct, widthPct]);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!drag.current || readOnly) return;
      const el = paperRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const d = drag.current;
      if (d.kind === "move") {
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        const next = clampWatermarkLayout(
          {
            xPct: d.start.xPct + (dx / r.width) * 100,
            yPct: d.start.yPct + (dy / r.height) * 100,
            widthPct: d.start.widthPct,
          },
          r.width,
          r.height,
          effectiveAspect,
        );
        setLocal(next);
        localRef.current = next;
      } else {
        const dx = e.clientX - d.startX;
        const next = clampWatermarkLayout(
          {
            xPct: d.start.xPct,
            yPct: d.start.yPct,
            widthPct: d.start.widthPct + (dx / r.width) * 100,
          },
          r.width,
          r.height,
          effectiveAspect,
        );
        setLocal(next);
        localRef.current = next;
      }
    },
    [effectiveAspect, paperRef, readOnly],
  );

  const startDrag = (kind: "move" | "resize") => (e: React.PointerEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    drag.current = {
      kind,
      startX: e.clientX,
      startY: e.clientY,
      start: { ...localRef.current },
    };
    const handleUp = () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", handleUp);
      document.removeEventListener("pointercancel", handleUp);
      drag.current = null;
      onLayoutChange(localRef.current);
    };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", handleUp);
    document.addEventListener("pointercancel", handleUp);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-[3]" aria-hidden>
      <div
        className="pointer-events-auto absolute select-none"
        style={{
          left: `${local.xPct}%`,
          top: `${local.yPct}%`,
          width: `${local.widthPct}%`,
        }}
      >
        <div
          className={cn(
            "relative",
            !readOnly && "cursor-move ring-1 ring-primary/40",
          )}
          onPointerDown={startDrag("move")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            draggable={false}
            className="h-auto w-full object-contain"
            style={{ opacity: Math.min(0.35, Math.max(0, opacity)) }}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                onAspectChange(img.naturalWidth / img.naturalHeight);
              }
            }}
          />
          {!readOnly ? (
            <button
              type="button"
              aria-label="Redimensionar marca d'água"
              className="absolute -bottom-1 -right-1 z-[1] h-4 w-4 cursor-nwse-resize rounded-sm border border-primary bg-background shadow touch-manipulation"
              onPointerDown={startDrag("resize")}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

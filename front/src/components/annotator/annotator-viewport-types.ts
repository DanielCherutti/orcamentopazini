/** Zoom/pan do Konva Stage no anotador — persistido em `budget_image.editor_viewport`. */
export type AnnotatorViewportState = {
    scale: number;
    x: number;
    y: number;
};

export function parseAnnotatorViewport(raw: unknown): AnnotatorViewportState | null {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    const scale = Number(o.scale);
    const x = Number(o.x);
    const y = Number(o.y);
    if (!Number.isFinite(scale) || scale < 0.2 || scale > 5) return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { scale, x, y };
}

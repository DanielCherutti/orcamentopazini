import type {
    ImageAnnotation,
    StepAnnotation,
    ArrowAnnotation,
    TextAnnotation,
    RectAnnotation,
    StickerAnnotation,
    PolylineAnnotation,
    Point,
} from "./tools/types";

/**
 * Bounding box de imagem + anotações em coordenadas de stage (export/save).
 */
export function computeAnnotatorContentBBox(
    annotations: ImageAnnotation[],
    imageOffset: { x: number; y: number },
    imageSize: { width: number; height: number }
): { x: number; y: number; width: number; height: number } {
    const ANNO_MARGIN = 60;
    let minX = imageOffset.x;
    let minY = imageOffset.y;
    let maxX = imageOffset.x + imageSize.width;
    let maxY = imageOffset.y + imageSize.height;

    const expand = (sx: number, sy: number, mw = ANNO_MARGIN, mh = ANNO_MARGIN) => {
        minX = Math.min(minX, sx - mw);
        minY = Math.min(minY, sy - mh);
        maxX = Math.max(maxX, sx + mw);
        maxY = Math.max(maxY, sy + mh);
    };
    const toStage = (p: Point) => ({
        x: imageOffset.x + p.x * imageSize.width,
        y: imageOffset.y + p.y * imageSize.height,
    });

    for (const ann of annotations) {
        switch (ann.tool_type) {
            case "step_number": {
                const s = ann as StepAnnotation;
                const { x, y } = toStage(s.position);
                expand(x, y, s.radius + 16, s.radius + 16);
                break;
            }
            case "arrow": {
                const a = ann as ArrowAnnotation;
                for (const p of a.points) {
                    const { x, y } = toStage(p);
                    expand(x, y, 24, 24);
                }
                break;
            }
            case "text": {
                const t = ann as TextAnnotation;
                const { x, y } = toStage(t.position);
                const w = t.width || 100;
                const h = t.height || (t.fontSize || 14) * 3;
                expand(x + w / 2, y + h / 2, w / 2 + 16, h / 2 + 16);
                break;
            }
            case "rect": {
                const r = ann as RectAnnotation;
                const x1 = imageOffset.x + r.position.x * imageSize.width;
                const y1 = imageOffset.y + r.position.y * imageSize.height;
                const x2 = imageOffset.x + (r.position.x + r.width) * imageSize.width;
                const y2 = imageOffset.y + (r.position.y + r.height) * imageSize.height;
                minX = Math.min(minX, x1 - 16);
                minY = Math.min(minY, y1 - 16);
                maxX = Math.max(maxX, x2 + 16);
                maxY = Math.max(maxY, y2 + 16);
                break;
            }
            case "product_sticker": {
                const st = ann as StickerAnnotation;
                const { x, y } = toStage(st.position);
                const hw = ((st.width || 100) * (st.scaleX || 1)) / 2 + 16;
                const hh = ((st.height || 100) * (st.scaleY || 1)) / 2 + 16;
                expand(x, y, hw, hh);
                break;
            }
            case "polyline": {
                const pl = ann as PolylineAnnotation;
                for (const p of pl.points) {
                    const { x, y } = toStage(p);
                    expand(x, y, 12, 12);
                }
                break;
            }
        }
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

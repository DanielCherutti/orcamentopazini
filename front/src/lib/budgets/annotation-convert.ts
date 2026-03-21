/**
 * Converte anotações do formato DB (SurrealDB) para o formato esperado pelo frontend (ImageAnnotation).
 */
import type { ImageAnnotation } from "@/components/annotator/tools/types";
import { DEFAULT_STYLE } from "@/components/annotator/tools/types";

interface DbAnnotation {
  id?: string;
  tool_type: string;
  style?: Record<string, unknown>;
  geometry?: {
    x?: number;
    y?: number;
    points?: Array<{ x: number; y: number }>;
    width?: number;
    height?: number;
    fontSize?: number;
    padding?: number;
    image_url?: string;
    product_name?: string;
    rotation?: number;
    scaleX?: number;
    scaleY?: number;
  };
  content?: string;
  linked_item_id?: string;
  fontColor?: string;
  strokeColor?: string;
  textStrokeWidth?: number;
  borderColor?: string;
}

function ensureId(ann: DbAnnotation, index: number): string {
  if (ann.id && typeof ann.id === "string") return ann.id;
  return `ann-${Date.now()}-${index}`;
}

export function dbAnnotationsToFrontend(dbAnnotations: unknown[]): ImageAnnotation[] {
  if (!Array.isArray(dbAnnotations)) return [];
  const style = { ...DEFAULT_STYLE };

  return dbAnnotations.map((ann: unknown, i: number) => {
    const a = ann as DbAnnotation;
    const id = ensureId(a, i);
    const geom = a.geometry || {};
    const st = a.style && typeof a.style === "object" ? { ...style, ...a.style } : style;
    // linked_item_id pode chegar como RecordId do SurrealDB — garantir string pura
    const linked_item_id = a.linked_item_id ? String(a.linked_item_id) : undefined;

    switch (a.tool_type) {
      case "arrow":
        return {
          id,
          tool_type: "arrow" as const,
          style: st,
          points: geom.points || [{ x: 0, y: 0 }, { x: 0.2, y: 0.2 }],
          pointerLength: 15,
          pointerWidth: 15,
          linked_item_id,
        };

      case "rect":
        return {
          id,
          tool_type: "rect" as const,
          style: st,
          position: { x: geom.x ?? 0, y: geom.y ?? 0 },
          width: geom.width ?? 50,
          height: geom.height ?? 50,
          linked_item_id,
        };

      case "text":
        return {
          id,
          tool_type: "text" as const,
          style: st,
          position: { x: geom.x ?? 0, y: geom.y ?? 0 },
          content: a.content ?? "",
          fontSize: geom.fontSize != null ? Number(geom.fontSize) : 14,
          width: geom.width != null ? Number(geom.width) : 200,
          height: geom.height != null ? Number(geom.height) : undefined,
          padding: geom.padding != null ? Number(geom.padding) : 8,
          backgroundColor: "transparent",
          linked_item_id,
          fontColor: a.fontColor,
          strokeColor: a.strokeColor,
          textStrokeWidth: a.textStrokeWidth,
          borderColor: a.borderColor,
        };

      case "step_number":
        return {
          id,
          tool_type: "step_number" as const,
          style: st,
          position: { x: geom.x ?? 0, y: geom.y ?? 0 },
          number: parseInt(a.content ?? "1", 10) || 1,
          radius: 20,
          linked_item_id,
        };

      case "product_sticker":
        return {
          id,
          tool_type: "product_sticker" as const,
          style: st,
          position: { x: geom.x ?? 0, y: geom.y ?? 0 },
          width: geom.width ?? 100,
          height: geom.height ?? 100,
          image_url: geom.image_url,
          product_name: geom.product_name,
          rotation: geom.rotation,
          scaleX: geom.scaleX,
          scaleY: geom.scaleY,
          linked_item_id,
        };

      default:
        return {
          id,
          tool_type: "text" as const,
          style: st,
          position: { x: geom.x ?? 0, y: geom.y ?? 0 },
          content: a.content ?? "",
          fontSize: geom.fontSize != null ? Number(geom.fontSize) : 14,
          width: geom.width != null ? Number(geom.width) : 200,
          height: geom.height != null ? Number(geom.height) : undefined,
          padding: geom.padding != null ? Number(geom.padding) : 8,
          backgroundColor: "transparent",
          linked_item_id,
          fontColor: a.fontColor,
          strokeColor: a.strokeColor,
          textStrokeWidth: a.textStrokeWidth,
          borderColor: a.borderColor,
        };
    }
  });
}

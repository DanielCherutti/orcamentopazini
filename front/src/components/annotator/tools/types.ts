// Tipos para o sistema de anotações visuais

export type ToolType = 'step_number' | 'arrow' | 'text' | 'rect' | 'select' | 'product_sticker' | 'polyline';

export interface Point {
    x: number; // Coordenada relativa (0-1)
    y: number; // Coordenada relativa (0-1)
}

export interface AnnotationStyle {
    color: string;
    strokeWidth: number;
    opacity: number;
    shadowEnabled: boolean;
    shadowBlur: number;
    shadowColor: string;
    shadowOffsetX: number;
    shadowOffsetY: number;
}

export interface BaseAnnotation {
    id: string;
    tool_type: ToolType;
    style: AnnotationStyle;
    linked_item_id?: string; // ID do item de orçamento vinculado
    content?: string; // Cache de conteúdo (para texto ou número)
}

export interface StepAnnotation extends BaseAnnotation {
    tool_type: 'step_number';
    position: Point;
    number: number;
    radius: number;
}

export interface ArrowAnnotation extends BaseAnnotation {
    tool_type: 'arrow';
    points: Point[]; // [start, end] ou [start, control, end] para Bezier
    pointerLength: number;
    pointerWidth: number;
    linked_from_sticker_id?: string; // ID do sticker ao qual a origem está vinculada
}

export interface TextAnnotation extends BaseAnnotation {
    tool_type: 'text';
    position: Point;
    content: string;
    fontSize: number;
    width: number;
    height?: number;          // Altura do box (undefined = automática baseada em fontSize + padding)
    padding: number;
    backgroundColor: string;
    fontColor?: string;       // Cor do texto (default: style.color)
    strokeColor?: string;     // Cor do contorno do texto (default: sem contorno)
    textStrokeWidth?: number; // Espessura do contorno do texto (default: 0)
    borderColor?: string;     // Cor da borda do box (default: sem borda)
}

export interface RectAnnotation extends BaseAnnotation {
    tool_type: 'rect';
    position: Point;
    width: number;
    height: number;
}

export interface StickerAnnotation extends BaseAnnotation {
    tool_type: 'product_sticker';
    position: Point;
    image_url?: string;
    product_name?: string;
    /** Catálogo: usado para sincronizar ícone/nome ao alterar o produto quando não há `linked_item_id`. */
    product_id?: string;
    width: number;
    height: number;
    rotation?: number;
    scaleX?: number;
    scaleY?: number;
}

export interface PolylineAnnotation extends BaseAnnotation {
    tool_type: 'polyline';
    points: Point[];           // mínimo 2, coordenadas relativas 0-1
    lineStyle: 'solid' | 'dashed' | 'dotted';
    strokeWidth: number;       // 1–10px
}

export type ImageAnnotation = StepAnnotation | ArrowAnnotation | TextAnnotation | RectAnnotation | StickerAnnotation | PolylineAnnotation;

// Paleta de cores Screenpresso-like
export const ANNOTATION_COLORS = {
    magenta: '#FF006E',
    cyan: '#00D9FF',
    lime: '#AAFF00',
    redSafety: '#FF3333',
    yellow: '#FFD60A',
    white: '#FFFFFF',
    black: '#000000'
} as const;

// Estilo padrão Screenpresso
export const DEFAULT_STYLE: AnnotationStyle = {
    color: ANNOTATION_COLORS.redSafety,
    strokeWidth: 3,
    opacity: 1,
    shadowEnabled: true,
    shadowBlur: 8,
    shadowColor: 'rgba(0, 0, 0, 0.5)',
    shadowOffsetX: 2,
    shadowOffsetY: 2
};

// Configurações de ferramentas
export const TOOL_CONFIG = {
    step_number: {
        radius: 20,
        fontSize: 16,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 'bold'
    },
    arrow: {
        pointerLength: 15,
        pointerWidth: 15,
        strokeWidth: 4
    },
    text: {
        fontSize: 14,
        padding: 8,
        backgroundColor: 'transparent',
        borderRadius: 4
    },
    rect: {
        cornerRadius: 4,
        strokeWidth: 3
    }
} as const;

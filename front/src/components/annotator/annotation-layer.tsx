"use client";

import { Layer } from 'react-konva';
import { ImageAnnotation, StepAnnotation, ArrowAnnotation, TextAnnotation, RectAnnotation, StickerAnnotation, PolylineAnnotation, Point } from './tools/types';
import { StepNumberTool } from './tools/step-tool';
import { ArrowTool } from './tools/arrow-tool';
import { TextTool } from './tools/text-tool';
import { RectTool } from './tools/rect-tool';
import { StickerTool } from './tools/sticker-tool';
import { PolylineTool } from './tools/polyline-tool';

interface AnnotationLayerProps {
    annotations: ImageAnnotation[];
    imageSize: { width: number; height: number };
    imageOffset?: { x: number; y: number };
    selectedId: string | null;
    onSelect: (id: string) => void;
    onUpdate: (id: string, updates: Partial<ImageAnnotation>) => void;
    onEditStart: (id: string, toolType: 'text' | 'step_number' | 'polyline') => void;
    onCreateLinkedArrow?: (stickerId: string, startRel: Point, endRel: Point) => void;
    readOnly?: boolean;
}

export function AnnotationLayer({
    annotations,
    imageSize,
    imageOffset,
    selectedId,
    onSelect,
    onUpdate,
    onEditStart,
    onCreateLinkedArrow,
    readOnly = false
}: AnnotationLayerProps) {
    // Ponto de origem da seta vinculada ao ícone: borda direita, centro vertical
    // (onde fica o handle azul) — evita “sair do meio” do PNG com fundo branco.
    const stickerArrowStarts = new Map<string, Point>();
    annotations.forEach(a => {
        if (a.tool_type === 'product_sticker') {
            const s = a as StickerAnnotation;
            const w = s.width || 100;
            const h = s.height || 100;
            const sx = s.scaleX || 1;
            const sy = s.scaleY || 1;
            stickerArrowStarts.set(s.id, {
                x: s.position.x + (w * sx) / imageSize.width,
                y: s.position.y + (h * sy) / (2 * imageSize.height),
            });
        }
    });

    // Ordenação (z-index): retângulos/polylines → stickers → setas (por cima do ícone)
    // → texto e numeração.
    const sortedAnnotations = [...annotations].sort((a, b) => {
        const getZIndex = (type: string) => {
            if (type === 'rect' || type === 'polyline') return 1;
            if (type === 'product_sticker') return 2;
            if (type === 'arrow') return 3;
            return 4; // text, step_number
        };
        return getZIndex(a.tool_type) - getZIndex(b.tool_type);
    });

    return (
        <Layer x={imageOffset?.x ?? 0} y={imageOffset?.y ?? 0}>
            {sortedAnnotations.map((annotation) => {
                const isSelected = annotation.id === selectedId;

                switch (annotation.tool_type) {
                    case 'step_number':
                        return (
                            <StepNumberTool
                                key={annotation.id}
                                annotation={annotation as StepAnnotation}
                                imageSize={imageSize}
                                isSelected={isSelected}
                                onSelect={() => onSelect(annotation.id)}
                                onUpdate={(updates) => onUpdate(annotation.id, updates)}
                                onEditStart={() => onEditStart(annotation.id, 'step_number')}
                                readOnly={readOnly}
                            />
                        );

                    case 'arrow':
                        return (
                            <ArrowTool
                                key={annotation.id}
                                annotation={annotation as ArrowAnnotation}
                                imageSize={imageSize}
                                isSelected={isSelected}
                                onSelect={() => onSelect(annotation.id)}
                                onUpdate={(updates) => onUpdate(annotation.id, updates)}
                                stickerArrowStarts={stickerArrowStarts}
                                readOnly={readOnly}
                            />
                        );

                    case 'text':
                        return (
                            <TextTool
                                key={annotation.id}
                                annotation={annotation as TextAnnotation}
                                imageSize={imageSize}
                                isSelected={isSelected}
                                onSelect={() => onSelect(annotation.id)}
                                onUpdate={(updates) => onUpdate(annotation.id, updates)}
                                onEditStart={() => onEditStart(annotation.id, 'text')}
                                readOnly={readOnly}
                            />
                        );

                    case 'rect':
                        return (
                            <RectTool
                                key={annotation.id}
                                annotation={annotation as RectAnnotation}
                                imageSize={imageSize}
                                isSelected={isSelected}
                                onSelect={() => onSelect(annotation.id)}
                                onUpdate={(updates) => onUpdate(annotation.id, updates)}
                                readOnly={readOnly}
                            />
                        );

                    case 'product_sticker':
                        return (
                            <StickerTool
                                key={annotation.id}
                                annotation={annotation as StickerAnnotation}
                                imageSize={imageSize}
                                isSelected={isSelected}
                                onSelect={() => onSelect(annotation.id)}
                                onUpdate={(updates) => onUpdate(annotation.id, updates)}
                                onCreateLinkedArrow={(start, end) => onCreateLinkedArrow?.(annotation.id, start, end)}
                                readOnly={readOnly}
                            />
                        );

                    case 'polyline':
                        return (
                            <PolylineTool
                                key={annotation.id}
                                annotation={annotation as PolylineAnnotation}
                                imageSize={imageSize}
                                isSelected={isSelected}
                                onSelect={() => onSelect(annotation.id)}
                                onUpdate={(updates) => onUpdate(annotation.id, updates)}
                                onEditStart={() => onEditStart(annotation.id, 'polyline')}
                                readOnly={readOnly}
                            />
                        );

                    default:
                        return null;
                }
            })}
        </Layer>
    );
}

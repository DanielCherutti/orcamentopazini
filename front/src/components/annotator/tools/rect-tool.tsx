"use client";

import { useRef, useEffect } from 'react';
import { Rect, Transformer } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { RectAnnotation, TOOL_CONFIG } from './types';
import { toAbsoluteCoordinates } from '../utils/geometry';
import Konva from 'konva';

interface RectToolProps {
    annotation: RectAnnotation;
    imageSize: { width: number; height: number };
    isSelected: boolean;
    onSelect: () => void;
    onUpdate: (updates: Partial<RectAnnotation>) => void;
    readOnly?: boolean;
}

export function RectTool({
    annotation,
    imageSize,
    isSelected,
    onSelect,
    onUpdate,
    readOnly = false
}: RectToolProps) {
    const shapeRef = useRef<Konva.Rect>(null);
    const trRef = useRef<Konva.Transformer>(null);

    const absolutePos = toAbsoluteCoordinates(
        annotation.position,
        imageSize.width,
        imageSize.height
    );

    const style = annotation.style;
    const isRelativeSize = annotation.width <= 1 && annotation.height <= 1;
    const absWidth = isRelativeSize ? annotation.width * imageSize.width : annotation.width;
    const absHeight = isRelativeSize ? annotation.height * imageSize.height : annotation.height;

    useEffect(() => {
        if (isSelected && trRef.current && shapeRef.current && !readOnly) {
            trRef.current.nodes([shapeRef.current]);
            trRef.current.getLayer()?.batchDraw();
        }
    }, [isSelected, readOnly]);

    const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
        if (readOnly) return;

        const node = e.target;
        const newX = node.x();
        const newY = node.y();

        const relativeX = newX / imageSize.width;
        const relativeY = newY / imageSize.height;

        onUpdate({
            position: { x: relativeX, y: relativeY }
        });
    };

    const handleTransformEnd = () => {
        if (readOnly || !shapeRef.current) return;

        const node = shapeRef.current;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();

        // Reseta escala e atualiza largura/altura
        node.scaleX(1);
        node.scaleY(1);

        const newWidth = Math.max(5, node.width() * scaleX);
        const newHeight = Math.max(5, node.height() * scaleY);
        const newX = node.x();
        const newY = node.y();

        const relativeX = newX / imageSize.width;
        const relativeY = newY / imageSize.height;

        onUpdate({
            position: { x: relativeX, y: relativeY },
            width: isRelativeSize ? newWidth / imageSize.width : newWidth,
            height: isRelativeSize ? newHeight / imageSize.height : newHeight
        });
    };

    return (
        <>
            <Rect
                ref={shapeRef}
                x={absolutePos.x}
                y={absolutePos.y}
                width={absWidth}
                height={absHeight}
                stroke={style.color}
                strokeWidth={style.strokeWidth || 3}
                cornerRadius={TOOL_CONFIG.rect.cornerRadius || 4}
                fill="transparent" // Fundo transparente para apenas destacar
                draggable={!readOnly}
                onClick={onSelect}
                onTap={onSelect}
                onDragEnd={handleDragEnd}
                onTransformEnd={handleTransformEnd}
                shadowBlur={style.shadowEnabled ? style.shadowBlur : 0}
                shadowColor={style.shadowColor}
                shadowOpacity={0.4}
                shadowOffsetX={style.shadowOffsetX}
                shadowOffsetY={style.shadowOffsetY}
                hitStrokeWidth={20} // Facilita seleção
                onMouseEnter={(e) => {
                    if (!readOnly) {
                        const container = e.target.getStage()?.container();
                        if (container) container.style.cursor = 'move';
                    }
                }}
                onMouseLeave={(e) => {
                    const container = e.target.getStage()?.container();
                    if (container) container.style.cursor = 'default';
                }}
            />
            {isSelected && !readOnly && (
                <Transformer
                    ref={trRef}
                    boundBoxFunc={(oldBox, newBox) => {
                        // Limitar tamanho mínimo
                        if (newBox.width < 10 || newBox.height < 10) {
                            return oldBox;
                        }
                        return newBox;
                    }}
                    rotateEnabled={false} // Simplificar: sem rotação por enquanto
                />
            )}
        </>
    );
}

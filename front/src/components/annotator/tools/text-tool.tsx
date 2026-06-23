"use client";

import { useState, useRef, useEffect } from 'react';
import { Rect, Text, Group, Transformer } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { TextAnnotation, TOOL_CONFIG } from './types';
import { toAbsoluteCoordinates } from '../utils/geometry';
import Konva from 'konva';

interface TextToolProps {
    annotation: TextAnnotation;
    imageSize: { width: number; height: number };
    isSelected: boolean;
    onSelect: () => void;
    onUpdate: (updates: Partial<TextAnnotation>) => void;
    onEditStart?: () => void;
    readOnly?: boolean;
}

export function TextTool({
    annotation,
    imageSize,
    isSelected,
    onSelect,
    onUpdate,
    onEditStart,
    readOnly = false
}: TextToolProps) {
    const [isDragging, setIsDragging] = useState(false);
    const shapeRef = useRef<Konva.Group>(null);
    const trRef = useRef<Konva.Transformer>(null);

    const absolutePos = toAbsoluteCoordinates(
        annotation.position,
        imageSize.width,
        imageSize.height
    );

    const config = TOOL_CONFIG.text;
    const style = annotation.style;
    const textWidth = annotation.width || 200;
    const padding = annotation.padding || config.padding;
    // Altura: usa valor salvo se disponível, senão calcula a partir de fontSize + padding
    const textHeight = annotation.height ?? (annotation.fontSize + padding * 2);

    useEffect(() => {
        if (isSelected && trRef.current && shapeRef.current && !readOnly) {
            trRef.current.nodes([shapeRef.current]);
            trRef.current.getLayer()?.batchDraw();
        }
    }, [isSelected, readOnly]);

    const handleDragStart = () => setIsDragging(true);

    const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
        if (readOnly) return;
        setIsDragging(false);

        const node = e.target;
        const newX = node.x();
        const newY = node.y();

        // Permitir arrastar para fora da imagem
        node.x(newX);
        node.y(newY);

        onUpdate({ position: { x: newX / imageSize.width, y: newY / imageSize.height } });
    };

    const handleTransformEnd = () => {
        if (readOnly || !shapeRef.current) return;

        const node = shapeRef.current;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();

        // Reseta escala e aplica nas dimensões
        node.scaleX(1);
        node.scaleY(1);

        const newWidth = Math.max(80, textWidth * scaleX);
        const newHeight = Math.max(30, textHeight * scaleY);
        const newX = node.x();
        const newY = node.y();

        onUpdate({
            position: { x: newX / imageSize.width, y: newY / imageSize.height },
            width: newWidth,
            height: newHeight,
        });
    };

    const handleDoubleClick = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
        if (readOnly) return;
        e.cancelBubble = true;
        if (onEditStart) onEditStart();
    };

    return (
        <>
            <Group
                ref={shapeRef}
                x={absolutePos.x}
                y={absolutePos.y}
                draggable={!readOnly}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onClick={onSelect}
                onTap={onSelect}
                onDblClick={handleDoubleClick}
                onDblTap={handleDoubleClick}
                onTransformEnd={handleTransformEnd}
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
            >
                {/* Borda do box (opcional) */}
                {annotation.borderColor && (
                    <Rect
                        width={textWidth}
                        height={textHeight}
                        stroke={annotation.borderColor}
                        strokeWidth={2}
                        cornerRadius={config.borderRadius}
                        fill="transparent"
                    />
                )}

                {/* Texto com wrap */}
                <Text
                    text={annotation.content || 'Clique duplo para editar'}
                    fontSize={annotation.fontSize}
                    fontFamily="Inter, sans-serif"
                    fill={annotation.content ? (annotation.fontColor || style.color) : '#999'}
                    fontStyle={annotation.content ? 'normal' : 'italic'}
                    stroke={annotation.strokeColor}
                    strokeWidth={annotation.textStrokeWidth || 0}
                    width={textWidth}
                    height={textHeight}
                    padding={padding}
                    wrap="word"
                    align="left"
                    verticalAlign="middle"
                    shadowEnabled={style.shadowEnabled && !isDragging}
                    shadowBlur={isDragging ? 16 : style.shadowBlur}
                    shadowColor={style.shadowColor}
                    shadowOffsetX={isDragging ? 0 : style.shadowOffsetX}
                    shadowOffsetY={isDragging ? 0 : style.shadowOffsetY}
                    opacity={isDragging ? 0.8 : 1}
                />
            </Group>

            {/* Transformer para redimensionamento livre */}
            {isSelected && !readOnly && (
                <Transformer
                    ref={trRef}
                    rotateEnabled={false}
                    boundBoxFunc={(oldBox, newBox) => {
                        // Tamanho mínimo: 80×30px
                        if (newBox.width < 80 || newBox.height < 30) return oldBox;
                        return newBox;
                    }}
                />
            )}
        </>
    );
}

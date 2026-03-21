"use client";

import { useRef, useEffect, useState } from 'react';
import { Image as KonvaImage, Group, Transformer, Rect, Text, Circle, Arrow } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { StickerAnnotation, Point } from './types';
import useImage from 'use-image';
import Konva from 'konva';

interface StickerToolProps {
    annotation: StickerAnnotation;
    imageSize: { width: number; height: number };
    isSelected: boolean;
    onSelect: () => void;
    onUpdate: (updates: Partial<StickerAnnotation>) => void;
    onCreateLinkedArrow?: (startRel: Point, endRel: Point) => void;
    readOnly?: boolean;
}

export function StickerTool({
    annotation,
    imageSize,
    isSelected,
    onSelect,
    onUpdate,
    onCreateLinkedArrow,
    readOnly = false
}: StickerToolProps) {
    const shapeRef = useRef<Konva.Group>(null);
    const trRef = useRef<Konva.Transformer>(null);

    const [handleDragging, setHandleDragging] = useState(false);
    const [handleDragAbs, setHandleDragAbs] = useState<{ x: number; y: number } | null>(null);

    // Carregar imagem
    // Nota: crossOrigin anonymous é importante para export
    const [image] = useImage(annotation.image_url || '', 'anonymous');

    useEffect(() => {
        if (isSelected && trRef.current && shapeRef.current) {
            trRef.current.nodes([shapeRef.current]);
            trRef.current.getLayer()?.batchDraw();
        }
    }, [isSelected]);

    const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
        if (readOnly) return;

        const node = e.target;
        const x = node.x();
        const y = node.y();

        onUpdate({
            position: {
                x: x / imageSize.width,
                y: y / imageSize.height
            }
        });
    };

    const handleTransformEnd = (_e: KonvaEventObject<Event>) => {
        if (readOnly) return;
        const node = shapeRef.current;
        if (!node) return;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        const rotation = node.rotation();

        // Não resetamos scaleX/Y para 1 para manter simplicidade no Konva,
        // mas salvamos.

        onUpdate({
            position: {
                x: node.x() / imageSize.width,
                y: node.y() / imageSize.height
            },
            rotation: rotation,
            scaleX: scaleX,
            scaleY: scaleY
            // width e height originais não mudam, scale que muda visualmente
        });
    };

    // Coordenadas absolutas para render
    const absX = annotation.position.x * imageSize.width;
    const absY = annotation.position.y * imageSize.height;
    const width = annotation.width || 100;
    const height = annotation.height || 100;
    const sx = annotation.scaleX || 1;
    const sy = annotation.scaleY || 1;

    // Posição do handle na borda direita, centro vertical (em Layer coords)
    const handleInitX = absX + width * sx;
    const handleInitY = absY + (height * sy) / 2;

    return (
        <>
            {/* Preview da seta durante o drag do handle */}
            {handleDragging && handleDragAbs && (
                <Arrow
                    points={[
                        handleInitX,
                        handleInitY,
                        handleDragAbs.x,
                        handleDragAbs.y
                    ]}
                    stroke="#0EA5E9"
                    strokeWidth={2}
                    fill="#0EA5E9"
                    dash={[4, 4]}
                    opacity={0.7}
                    listening={false}
                    pointerLength={10}
                    pointerWidth={10}
                />
            )}

            <Group
                ref={shapeRef}
                x={absX}
                y={absY}
                width={width}
                height={height}
                rotation={annotation.rotation || 0}
                scaleX={sx}
                scaleY={sy}
                draggable={!readOnly}
                onClick={onSelect}
                onTap={onSelect}
                onDragEnd={handleDragEnd}
                onTransformEnd={handleTransformEnd}
            >
                {image && image.width > 0 && image.height > 0 ? (
                    <KonvaImage
                        image={image}
                        width={width}
                        height={height}
                        opacity={annotation.style?.opacity || 1}
                    />
                ) : (
                    // Placeholder se não tiver imagem
                    <Group>
                        <Rect
                            width={width}
                            height={height}
                            fill="#f0f0f0"
                            stroke="#333"
                            strokeWidth={1}
                            cornerRadius={4}
                            shadowColor="black"
                            shadowBlur={5}
                            shadowOpacity={0.2}
                        />
                        <Text
                            text={annotation.product_name || "Produto"}
                            width={width}
                            height={height}
                            align="center"
                            verticalAlign="middle"
                            fontSize={12}
                            fill="#333"
                            padding={5}
                        />
                    </Group>
                )}
            </Group>

            {isSelected && !readOnly && (
                <Transformer
                    ref={trRef}
                    boundBoxFunc={(oldBox, newBox) => {
                        // Limitar tamanho mínimo
                        if (newBox.width < 20 || newBox.height < 20) {
                            return oldBox;
                        }
                        return newBox;
                    }}
                />
            )}

            {/* Handle arrastável para criar seta vinculada */}
            {isSelected && !readOnly && (
                <Circle
                    x={handleInitX}
                    y={handleInitY}
                    radius={8}
                    fill="#0EA5E9"
                    stroke="#FFFFFF"
                    strokeWidth={2}
                    title="Arraste para criar seta a partir da borda do ícone"
                    draggable
                    onDragStart={(e) => {
                        e.cancelBubble = true;
                        setHandleDragging(true);
                        setHandleDragAbs({ x: e.target.x(), y: e.target.y() });
                    }}
                    onDragMove={(e) => {
                        e.cancelBubble = true;
                        setHandleDragAbs({ x: e.target.x(), y: e.target.y() });
                    }}
                    onDragEnd={(e) => {
                        e.cancelBubble = true;
                        const endX = e.target.x();
                        const endY = e.target.y();

                        // Origem na borda direita do ícone (mesmo ponto do handle), não no centro do PNG
                        const startRel: Point = {
                            x: handleInitX / imageSize.width,
                            y: handleInitY / imageSize.height,
                        };
                        const endRel: Point = {
                            x: endX / imageSize.width,
                            y: endY / imageSize.height,
                        };

                        const dist = Math.sqrt(
                            Math.pow(endRel.x - startRel.x, 2) +
                            Math.pow(endRel.y - startRel.y, 2)
                        );
                        if (dist > 0.02) {
                            onCreateLinkedArrow?.(startRel, endRel);
                        }

                        // Resetar posição do handle para a posição inicial
                        e.target.x(handleInitX);
                        e.target.y(handleInitY);
                        setHandleDragging(false);
                        setHandleDragAbs(null);
                    }}
                    onMouseEnter={(e) => {
                        e.cancelBubble = true;
                        const container = e.target.getStage()?.container();
                        if (container) container.style.cursor = 'crosshair';
                    }}
                    onMouseLeave={(e) => {
                        const container = e.target.getStage()?.container();
                        if (container) container.style.cursor = 'default';
                    }}
                />
            )}

        </>
    );
}

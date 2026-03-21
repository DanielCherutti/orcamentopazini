"use client";

import { useState } from 'react';
import { Arrow, Circle, Group } from 'react-konva';
import Konva from 'konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { ArrowAnnotation, TOOL_CONFIG, Point } from './types';
import { toAbsoluteCoordinates } from '../utils/geometry';

interface ArrowToolProps {
    annotation: ArrowAnnotation;
    imageSize: { width: number; height: number };
    isSelected: boolean;
    onSelect: () => void;
    onUpdate: (updates: Partial<ArrowAnnotation>) => void;
    /** Origem da seta quando vinculada a um sticker (borda direita do ícone, coords relativas). */
    stickerArrowStarts?: Map<string, Point>;
    readOnly?: boolean;
}

export function ArrowTool({
    annotation,
    imageSize,
    isSelected,
    onSelect,
    onUpdate,
    stickerArrowStarts,
    readOnly = false
}: ArrowToolProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [draggedPoint, setDraggedPoint] = useState<'start' | 'end' | null>(null);

    const config = TOOL_CONFIG.arrow;
    const style = annotation.style;

    // Seta vinculada: origem segue a borda direita do ícone (não o centro do retângulo).
    const linkedStart = annotation.linked_from_sticker_id
        ? stickerArrowStarts?.get(annotation.linked_from_sticker_id)
        : undefined;

    const effectiveRelPoints: Point[] = linkedStart
        ? [linkedStart, annotation.points[1] ?? annotation.points[0]]
        : annotation.points;

    // Converter pontos relativos para absolutos
    const points = effectiveRelPoints.map(point =>
        toAbsoluteCoordinates(point, imageSize.width, imageSize.height)
    );

    // Pontos da seta [x1, y1, x2, y2]
    const arrowPoints = points.length >= 2
        ? [points[0].x, points[0].y, points[1].x, points[1].y]
        : [0, 0, 0, 0];

    const handlePointDragStart = (pointType: 'start' | 'end') => {
        setIsDragging(true);
        setDraggedPoint(pointType);
    };

    const applyPointFromNode = (node: Konva.Node, pointType: 'start' | 'end', unlink?: boolean) => {
        const newX = node.x();
        const newY = node.y();
        const relativeX = newX / imageSize.width;
        const relativeY = newY / imageSize.height;
        const newPoints = [...annotation.points];
        const pointIndex = pointType === 'start' ? 0 : 1;
        newPoints[pointIndex] = { x: relativeX, y: relativeY };
        if (unlink) {
            onUpdate({ points: newPoints, linked_from_sticker_id: undefined });
        } else {
            onUpdate({ points: newPoints });
        }
    };

    const handlePointDragMove = (e: KonvaEventObject<DragEvent>, pointType: 'start' | 'end') => {
        if (readOnly) return;
        applyPointFromNode(e.target, pointType, false);
    };

    const handlePointDragEnd = (e: KonvaEventObject<DragEvent>, pointType: 'start' | 'end') => {
        if (readOnly) return;

        setIsDragging(false);
        setDraggedPoint(null);

        const node = e.target;
        // Ao mover a origem de uma seta vinculada, desvincula para não “puxar” de volta ao ícone.
        const unlink = pointType === 'start' && !!annotation.linked_from_sticker_id;
        applyPointFromNode(node, pointType, unlink);
    };

    const handleGroupDragStart = () => {
        setIsDragging(true);
    };

    const handleGroupDragEnd = (e: KonvaEventObject<DragEvent>) => {
        if (readOnly) return;
        setIsDragging(false);

        const node = e.target;
        const x = node.x();
        const y = node.y();

        // Resetar posição do grupo para (0,0)
        node.x(0);
        node.y(0);

        // Calcular deslocamento relativo
        const relativeDx = x / imageSize.width;
        const relativeDy = y / imageSize.height;

        // Atualizar todos os pontos com o deslocamento
        const updatedPoints = annotation.points.map(p => ({
            x: p.x + relativeDx,
            y: p.y + relativeDy
        }));

        onUpdate({ points: updatedPoints });
    };

    const isLinked = !!annotation.linked_from_sticker_id;

    return (
        <Group
            draggable={!readOnly && !draggedPoint}
            onDragStart={handleGroupDragStart}
            onDragEnd={handleGroupDragEnd}
            onClick={onSelect}
            onTap={onSelect}
            onMouseEnter={(e) => {
                if (!readOnly && !draggedPoint) {
                    const container = e.target.getStage()?.container();
                    if (container) container.style.cursor = 'move';
                }
            }}
            onMouseLeave={(e) => {
                const container = e.target.getStage()?.container();
                if (container) container.style.cursor = 'default';
            }}
        >
            {/* Área de hit transparente mais grossa para facilitar seleção/drag */}
            <Arrow
                points={arrowPoints}
                stroke="transparent"
                strokeWidth={20}
                pointerLength={config.pointerLength}
                pointerWidth={config.pointerWidth}
            />

            {/* Seta principal */}
            <Arrow
                points={arrowPoints}
                stroke="#FFFFFF"
                strokeWidth={style.strokeWidth + 2}
                fill="#FFFFFF"
                pointerLength={config.pointerLength}
                pointerWidth={config.pointerWidth}
                shadowEnabled={style.shadowEnabled && !isDragging}
                shadowBlur={style.shadowBlur}
                shadowColor={style.shadowColor}
                shadowOffsetX={style.shadowOffsetX}
                shadowOffsetY={style.shadowOffsetY}
                listening={false}
            />
            <Arrow
                points={arrowPoints}
                stroke={style.color}
                strokeWidth={style.strokeWidth}
                fill={style.color}
                pointerLength={config.pointerLength}
                pointerWidth={config.pointerWidth}
                opacity={isDragging ? 0.8 : style.opacity}
                listening={false}
            />

            {/* Pontos de controle (apenas quando selecionado) */}
            {isSelected && !readOnly && (
                <>
                    {/* Origem: em setas vinculadas, arrastar aqui desvincula do ícone e permite mover a ponta. */}
                    <Circle
                        x={points[0].x}
                        y={points[0].y}
                        radius={6}
                        fill="#0EA5E9"
                        stroke="#FFFFFF"
                        strokeWidth={2}
                        draggable
                        onDragStart={(e) => {
                            e.cancelBubble = true;
                            handlePointDragStart('start');
                            if (isLinked && linkedStart) {
                                const endRel =
                                    effectiveRelPoints[1] ??
                                    annotation.points[1] ??
                                    annotation.points[0];
                                onUpdate({
                                    linked_from_sticker_id: undefined,
                                    points: [linkedStart, endRel],
                                });
                            }
                        }}
                        onDragMove={(e) => {
                            e.cancelBubble = true;
                            handlePointDragMove(e, 'start');
                        }}
                        onDragEnd={(e) => {
                            e.cancelBubble = true;
                            handlePointDragEnd(e, 'start');
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

                    {/* Ponta (comprimento e direção) */}
                    <Circle
                        x={points[1].x}
                        y={points[1].y}
                        radius={6}
                        fill="#0EA5E9"
                        stroke="#FFFFFF"
                        strokeWidth={2}
                        draggable
                        onDragStart={(e) => {
                            e.cancelBubble = true;
                            handlePointDragStart('end');
                        }}
                        onDragMove={(e) => {
                            e.cancelBubble = true;
                            handlePointDragMove(e, 'end');
                        }}
                        onDragEnd={(e) => {
                            e.cancelBubble = true;
                            handlePointDragEnd(e, 'end');
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
                </>
            )}

            {/* Borda de seleção */}
            {isSelected && (
                <Arrow
                    points={arrowPoints}
                    stroke="#0EA5E9"
                    strokeWidth={2}
                    dash={[4, 4]}
                    pointerLength={config.pointerLength}
                    pointerWidth={config.pointerWidth}
                    listening={false}
                />
            )}
        </Group>
    );
}

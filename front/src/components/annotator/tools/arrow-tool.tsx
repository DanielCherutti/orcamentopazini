"use client";

import { useState } from 'react';
import { Arrow, Circle, Group } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { ArrowAnnotation, TOOL_CONFIG, Point } from './types';
import { toAbsoluteCoordinates } from '../utils/geometry';

interface ArrowToolProps {
    annotation: ArrowAnnotation;
    imageSize: { width: number; height: number };
    isSelected: boolean;
    onSelect: () => void;
    onUpdate: (updates: Partial<ArrowAnnotation>) => void;
    stickerCenters?: Map<string, Point>;
    readOnly?: boolean;
}

export function ArrowTool({
    annotation,
    imageSize,
    isSelected,
    onSelect,
    onUpdate,
    stickerCenters,
    readOnly = false
}: ArrowToolProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [draggedPoint, setDraggedPoint] = useState<'start' | 'end' | null>(null);

    const config = TOOL_CONFIG.arrow;
    const style = annotation.style;

    // Calcular pontos efetivos: substituir points[0] pelo centro do sticker quando vinculado
    const linkedCenter = annotation.linked_from_sticker_id
        ? stickerCenters?.get(annotation.linked_from_sticker_id)
        : undefined;

    const effectiveRelPoints: Point[] = linkedCenter
        ? [linkedCenter, annotation.points[1] ?? annotation.points[0]]
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

    const handlePointDragEnd = (e: KonvaEventObject<DragEvent>, pointType: 'start' | 'end') => {
        if (readOnly) return;

        setIsDragging(false);
        setDraggedPoint(null);

        const node = e.target;
        let newX = node.x();
        let newY = node.y();

        // Limitar dentro da imagem


        node.x(newX);
        node.y(newY);

        // Converter para coordenadas relativas
        const relativeX = newX / imageSize.width;
        const relativeY = newY / imageSize.height;

        // Atualizar o ponto correto
        const newPoints = [...annotation.points];
        const pointIndex = pointType === 'start' ? 0 : 1;
        newPoints[pointIndex] = { x: relativeX, y: relativeY };

        onUpdate({ points: newPoints });
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
                    {/* Ponto inicial — oculto em setas vinculadas (o sticker controla a origem) */}
                    {!isLinked && (
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
                    )}

                    {/* Ponto final */}
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

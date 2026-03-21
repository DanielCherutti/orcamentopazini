"use client";

import { useState } from 'react';
import { Line, Circle, Group } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { PolylineAnnotation } from './types';

interface PolylineToolProps {
    annotation: PolylineAnnotation;
    imageSize: { width: number; height: number };
    isSelected: boolean;
    onSelect: () => void;
    onUpdate: (updates: Partial<PolylineAnnotation>) => void;
    onEditStart: () => void;
    readOnly?: boolean;
}

export function PolylineTool({
    annotation,
    imageSize,
    isSelected,
    onSelect,
    onUpdate,
    onEditStart,
    readOnly = false,
}: PolylineToolProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [draggedPointIndex, setDraggedPointIndex] = useState<number | null>(null);

    const W = imageSize.width;
    const H = imageSize.height;
    const style = annotation.style;

    const absPoints = annotation.points.flatMap(p => [p.x * W, p.y * H]);

    const dashPattern =
        annotation.lineStyle === 'dashed' ? [8, 4] :
            annotation.lineStyle === 'dotted' ? [2, 4] :
                undefined;

    const handlePointDragStart = (index: number, e: KonvaEventObject<DragEvent>) => {
        e.cancelBubble = true;
        setDraggedPointIndex(index);
        setIsDragging(true);
    };

    const handlePointDragEnd = (index: number, e: KonvaEventObject<DragEvent>) => {
        e.cancelBubble = true;
        if (readOnly) return;

        const node = e.target;
        const newX = node.x();
        const newY = node.y();
        node.x(newX);
        node.y(newY);

        const newPoints = [...annotation.points];
        newPoints[index] = { x: newX / W, y: newY / H };
        onUpdate({ points: newPoints });

        setDraggedPointIndex(null);
        setIsDragging(false);
    };

    const handleGroupDragStart = () => {
        setIsDragging(true);
    };

    const handleGroupDragEnd = (e: KonvaEventObject<DragEvent>) => {
        if (readOnly) return;
        setIsDragging(false);

        const node = e.target;
        const dx = node.x();
        const dy = node.y();
        node.x(0);
        node.y(0);

        const relativeDx = dx / W;
        const relativeDy = dy / H;

        const newPoints = annotation.points.map(p => ({
            x: p.x + relativeDx,
            y: p.y + relativeDy,
        }));
        onUpdate({ points: newPoints });
    };

    if (absPoints.length < 4) return null;

    return (
        <Group
            draggable={!readOnly && draggedPointIndex === null}
            onDragStart={handleGroupDragStart}
            onDragEnd={handleGroupDragEnd}
            onClick={onSelect}
            onTap={onSelect}
            onDblClick={() => !readOnly && onEditStart()}
            onMouseEnter={(e) => {
                if (!readOnly && draggedPointIndex === null) {
                    const container = e.target.getStage()?.container();
                    if (container) container.style.cursor = 'move';
                }
            }}
            onMouseLeave={(e) => {
                const container = e.target.getStage()?.container();
                if (container) container.style.cursor = 'default';
            }}
        >
            {/* Área de hit transparente */}
            <Line
                points={absPoints}
                stroke="transparent"
                strokeWidth={20}
                lineCap="round"
                lineJoin="round"
            />

            {/* Sombra/contorno branco */}
            <Line
                points={absPoints}
                stroke="#FFFFFF"
                strokeWidth={(annotation.strokeWidth || 2) + 2}
                lineCap="round"
                lineJoin="round"
                dash={dashPattern}
                shadowEnabled={style.shadowEnabled && !isDragging}
                shadowBlur={style.shadowBlur}
                shadowColor={style.shadowColor}
                shadowOffsetX={style.shadowOffsetX}
                shadowOffsetY={style.shadowOffsetY}
                listening={false}
            />

            {/* Linha colorida */}
            <Line
                points={absPoints}
                stroke={style.color}
                strokeWidth={annotation.strokeWidth || 2}
                lineCap="round"
                lineJoin="round"
                dash={dashPattern}
                opacity={isDragging ? 0.8 : style.opacity}
                listening={false}
            />

            {/* Indicador de seleção */}
            {isSelected && (
                <Line
                    points={absPoints}
                    stroke="#0EA5E9"
                    strokeWidth={2}
                    dash={[4, 4]}
                    lineCap="round"
                    lineJoin="round"
                    listening={false}
                />
            )}

            {/* Círculos de controle nos vértices */}
            {isSelected && !readOnly && annotation.points.map((p, i) => (
                <Circle
                    key={i}
                    x={p.x * W}
                    y={p.y * H}
                    radius={6}
                    fill="#0EA5E9"
                    stroke="#FFFFFF"
                    strokeWidth={2}
                    draggable
                    onDragStart={(e) => handlePointDragStart(i, e)}
                    onDragEnd={(e) => handlePointDragEnd(i, e)}
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
            ))}
        </Group>
    );
}

"use client";

import { useState } from 'react';
import { Circle, Text, Group } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { StepAnnotation, TOOL_CONFIG } from './types';
import { toAbsoluteCoordinates } from '../utils/geometry';

interface StepNumberToolProps {
    annotation: StepAnnotation;
    imageSize: { width: number; height: number };
    isSelected: boolean;
    onSelect: () => void;
    onUpdate: (updates: Partial<StepAnnotation>) => void;
    onEditStart: () => void;
    readOnly?: boolean;
}

export function StepNumberTool({
    annotation,
    imageSize,
    isSelected,
    onSelect,
    onUpdate,
    onEditStart,
    readOnly = false
}: StepNumberToolProps) {
    const [isDragging, setIsDragging] = useState(false);

    const absolutePos = toAbsoluteCoordinates(
        annotation.position,
        imageSize.width,
        imageSize.height
    );

    const config = TOOL_CONFIG.step_number;
    const style = annotation.style;

    const handleDragStart = () => {
        setIsDragging(true);
    };

    const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
        if (readOnly) return;

        setIsDragging(false);

        const node = e.target;
        const newX = node.x();
        const newY = node.y();

        // Converter para coordenadas relativas
        const relativeX = newX / imageSize.width;
        const relativeY = newY / imageSize.height;

        onUpdate({
            position: { x: relativeX, y: relativeY }
        });
    };

    return (
        <Group
            x={absolutePos.x}
            y={absolutePos.y}
            draggable={!readOnly}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={onSelect}
            onTap={onSelect}
            onDblClick={(e) => {
                e.cancelBubble = true;
                if (!readOnly) onEditStart();
            }}
            // Cursor pointer ao hover
            onMouseEnter={(e) => {
                if (!readOnly) {
                    const container = e.target.getStage()?.container();
                    if (container) {
                        container.style.cursor = 'move';
                    }
                }
            }}
            onMouseLeave={(e) => {
                const container = e.target.getStage()?.container();
                if (container) {
                    container.style.cursor = 'default';
                }
            }}
        >
            {/* Círculo de fundo */}
            <Circle
                radius={config.radius}
                fill={style.color}
                stroke="#FFFFFF"
                strokeWidth={style.strokeWidth}
                shadowEnabled={style.shadowEnabled && !isDragging}
                shadowBlur={isDragging ? 16 : style.shadowBlur}
                shadowColor={style.shadowColor}
                shadowOffsetX={isDragging ? 0 : style.shadowOffsetX}
                shadowOffsetY={isDragging ? 0 : style.shadowOffsetY}
                opacity={isDragging ? 0.8 : style.opacity}
            />

            {/* Borda de seleção */}
            {isSelected && (
                <Circle
                    radius={config.radius + 4}
                    stroke="#0EA5E9"
                    strokeWidth={2}
                    dash={[4, 4]}
                />
            )}

            {/* Número */}
            <Text
                text={annotation.number.toString()}
                fontSize={config.fontSize}
                fontFamily={config.fontFamily}
                fontStyle={config.fontWeight}
                fill="#FFFFFF"
                align="center"
                verticalAlign="middle"
                offsetX={config.radius}
                offsetY={config.radius / 2}
                width={config.radius * 2}
                shadowEnabled={true}
                shadowBlur={2}
                shadowColor="rgba(0, 0, 0, 0.3)"
            />
        </Group>
    );
}

"use client";

import type { RefObject, DragEvent } from "react";
import { Stage, Layer, Image as KonvaImage, Arrow, Rect, Line, Circle } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import Konva from "konva";
import { AnnotationLayer } from "./annotation-layer";
import type { ImageAnnotation, Point } from "./tools/types";

export interface AnnotatorKonvaWorkspaceProps {
    containerRef: RefObject<HTMLDivElement | null>;
    readOnly: boolean;
    isSpaceDown: boolean;
    onDrop: (e: DragEvent<HTMLDivElement>) => void;
    onDragOver: (e: DragEvent<HTMLDivElement>) => void;
    imageSize: { width: number; height: number };
    stageSize: { width: number; height: number };
    imageOffset: { x: number; y: number };
    image: HTMLImageElement;
    stageRef: RefObject<Konva.Stage | null>;
    stageScale: number;
    onResetZoom: () => void;
    onStageClick: (e: KonvaEventObject<MouseEvent>) => void;
    onStageDblClick: (e: KonvaEventObject<MouseEvent>) => void;
    onStageMouseDown: (e: KonvaEventObject<MouseEvent>) => void;
    onStageMouseMove: (e: KonvaEventObject<MouseEvent>) => void;
    onStageMouseUp: () => void;
    onWheel: (e: KonvaEventObject<WheelEvent>) => void;
    stageDraggable: boolean;
    annotations: ImageAnnotation[];
    selectedAnnotationId: string | null;
    onAnnotationSelect: (id: string) => void;
    onAnnotationUpdate: (id: string, updates: Partial<ImageAnnotation>) => void;
    onEditStart: (id: string, toolType: "text" | "step_number" | "polyline") => void;
    onCreateLinkedArrow: (stickerId: string, startRel: Point, endRel: Point) => void;
    isDrawingArrow: boolean;
    arrowStartPoint: { x: number; y: number } | null;
    tempArrowEnd: { x: number; y: number } | null;
    isDrawingRect: boolean;
    rectStartPoint: { x: number; y: number } | null;
    tempRectEnd: { x: number; y: number } | null;
    isDrawingPolyline: boolean;
    polylinePoints: Point[];
    polylineTempEnd: Point | null;
    /** Guia visual do quadro de exibição (pixels do stage, alinhado à imagem). */
    displayFrameGuide?: { x: number; y: number; width: number; height: number } | null;
    /** Oculta overlays visuais durante exportação para não "queimar" no composed_url. */
    hideVisualGuides?: boolean;
}

export function AnnotatorKonvaWorkspace({
    containerRef,
    readOnly,
    isSpaceDown,
    onDrop,
    onDragOver,
    imageSize,
    stageSize,
    imageOffset,
    image,
    stageRef,
    stageScale,
    onResetZoom,
    onStageClick,
    onStageDblClick,
    onStageMouseDown,
    onStageMouseMove,
    onStageMouseUp,
    onWheel,
    stageDraggable,
    annotations,
    selectedAnnotationId,
    onAnnotationSelect,
    onAnnotationUpdate,
    onEditStart,
    onCreateLinkedArrow,
    isDrawingArrow,
    arrowStartPoint,
    tempArrowEnd,
    isDrawingRect,
    rectStartPoint,
    tempRectEnd,
    isDrawingPolyline,
    polylinePoints,
    polylineTempEnd,
    displayFrameGuide = null,
    hideVisualGuides = false,
}: AnnotatorKonvaWorkspaceProps) {
    return (
        <div
            ref={containerRef}
            className="border rounded-lg overflow-hidden bg-white relative flex-1 min-h-0"
            onDrop={onDrop}
            onDragOver={onDragOver}
            style={{ cursor: isSpaceDown ? "grab" : undefined }}
        >
            {imageSize.width > 0 && imageSize.height > 0 && (
                <Stage
                    ref={stageRef}
                    width={stageSize.width}
                    height={stageSize.height}
                    onClick={onStageClick}
                    onDblClick={onStageDblClick}
                    onMouseDown={onStageMouseDown}
                    onMouseMove={onStageMouseMove}
                    onMouseUp={onStageMouseUp}
                    onWheel={onWheel}
                    draggable={stageDraggable}
                >
                    <Layer>
                        <Rect
                            name="background"
                            x={imageOffset.x - 4000}
                            y={imageOffset.y - 4000}
                            width={imageSize.width + 8000}
                            height={imageSize.height + 8000}
                            fill="white"
                        />
                        <KonvaImage
                            name="background"
                            image={image}
                            x={imageOffset.x}
                            y={imageOffset.y}
                            width={imageSize.width}
                            height={imageSize.height}
                        />
                    </Layer>

                    <AnnotationLayer
                        annotations={annotations}
                        imageSize={imageSize}
                        imageOffset={imageOffset}
                        selectedId={selectedAnnotationId}
                        onSelect={onAnnotationSelect}
                        onUpdate={onAnnotationUpdate}
                        onEditStart={onEditStart}
                        onCreateLinkedArrow={onCreateLinkedArrow}
                        readOnly={readOnly}
                    />

                    {isDrawingArrow && arrowStartPoint && tempArrowEnd && (
                        <Layer x={imageOffset.x} y={imageOffset.y}>
                            <Arrow
                                points={[
                                    arrowStartPoint.x * imageSize.width,
                                    arrowStartPoint.y * imageSize.height,
                                    tempArrowEnd.x * imageSize.width,
                                    tempArrowEnd.y * imageSize.height,
                                ]}
                                stroke="#0EA5E9"
                                strokeWidth={3}
                                fill="#0EA5E9"
                                pointerLength={15}
                                pointerWidth={15}
                                opacity={0.6}
                                dash={[4, 4]}
                            />
                        </Layer>
                    )}
                    {isDrawingRect && rectStartPoint && tempRectEnd && (
                        <Layer x={imageOffset.x} y={imageOffset.y}>
                            <Rect
                                x={Math.min(rectStartPoint.x, tempRectEnd.x) * imageSize.width}
                                y={Math.min(rectStartPoint.y, tempRectEnd.y) * imageSize.height}
                                width={Math.abs(tempRectEnd.x - rectStartPoint.x) * imageSize.width}
                                height={Math.abs(tempRectEnd.y - rectStartPoint.y) * imageSize.height}
                                stroke="#FF3333"
                                strokeWidth={3}
                                cornerRadius={4}
                                dash={[4, 4]}
                                opacity={0.6}
                                fill="transparent"
                            />
                        </Layer>
                    )}
                    {isDrawingPolyline && polylinePoints.length >= 1 && (
                        <Layer x={imageOffset.x} y={imageOffset.y}>
                            {polylinePoints.length >= 2 && (
                                <Line
                                    points={polylinePoints.flatMap((p) => [
                                        p.x * imageSize.width,
                                        p.y * imageSize.height,
                                    ])}
                                    stroke="#0EA5E9"
                                    strokeWidth={2}
                                    dash={[4, 4]}
                                    opacity={0.7}
                                    lineCap="round"
                                    lineJoin="round"
                                    listening={false}
                                />
                            )}
                            {polylineTempEnd && (
                                <Line
                                    points={[
                                        polylinePoints[polylinePoints.length - 1].x * imageSize.width,
                                        polylinePoints[polylinePoints.length - 1].y * imageSize.height,
                                        polylineTempEnd.x * imageSize.width,
                                        polylineTempEnd.y * imageSize.height,
                                    ]}
                                    stroke="#0EA5E9"
                                    strokeWidth={2}
                                    dash={[4, 4]}
                                    opacity={0.5}
                                    lineCap="round"
                                    lineJoin="round"
                                    listening={false}
                                />
                            )}
                            {polylinePoints.map((p, i) => (
                                <Circle
                                    key={i}
                                    x={p.x * imageSize.width}
                                    y={p.y * imageSize.height}
                                    radius={4}
                                    fill="#0EA5E9"
                                    listening={false}
                                />
                            ))}
                        </Layer>
                    )}
                    {!hideVisualGuides &&
                        displayFrameGuide &&
                        displayFrameGuide.width > 0 &&
                        displayFrameGuide.height > 0 && (
                            <Layer name="display-frame-guide" listening={false}>
                                <Rect
                                    x={displayFrameGuide.x}
                                    y={displayFrameGuide.y}
                                    width={displayFrameGuide.width}
                                    height={displayFrameGuide.height}
                                    stroke="#2563eb"
                                    strokeWidth={2}
                                    dash={[10, 6]}
                                    fill="rgba(37, 99, 235, 0.06)"
                                    listening={false}
                                />
                            </Layer>
                        )}
                </Stage>
            )}

            {stageScale !== 1 && (
                <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5 bg-black/60 text-white text-xs rounded-md px-2 py-1 select-none">
                    <span>{Math.round(stageScale * 100)}%</span>
                    <button
                        type="button"
                        className="hover:text-white/70 transition-colors font-bold leading-none"
                        onClick={onResetZoom}
                        title="Resetar zoom"
                    >
                        ×
                    </button>
                </div>
            )}

            {!readOnly && (
                <div className="absolute bottom-2 left-2 z-10 text-[10px] text-muted-foreground/60 select-none pointer-events-none">
                    Scroll para zoom · Espaço+arrastar para mover
                </div>
            )}
        </div>
    );
}

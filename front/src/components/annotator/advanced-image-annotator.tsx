"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { AnnotatorViewportState } from "./annotator-viewport-types";
import type { DragEvent } from "react";
import { KonvaEventObject } from "konva/lib/Node";
import {
    ImageAnnotation,
    ToolType,
    DEFAULT_STYLE,
    StickerAnnotation,
    StepAnnotation,
    TextAnnotation,
    ArrowAnnotation,
    PolylineAnnotation,
    Point,
} from "./tools/types";
import { toRelativeCoordinates, generateAnnotationId } from "./utils/geometry";
import { BudgetItem } from "@/types/budget-types";
import { Toolbar } from "./toolbar";
import { CatalogDock } from "./catalog-dock";
import { toast } from "@/lib/toast";
import {
    addItemAction,
    getBudgetUsedProductGroupIdsAction,
} from "@/actions/budget-hierarchy-section-items-actions";
import { Product } from "@/actions/product-actions";
import type { ProductGroup } from "@/actions/product-group-actions";
import Konva from "konva";
import { InsertImageDialog } from "./insert-image-dialog";
import { computeAnnotatorContentBBox } from "./annotator-compute-content-bbox";
import { AnnotatorKonvaWorkspace } from "./annotator-konva-workspace";
import { AnnotatorEditAnnotationDialog } from "./annotator-edit-annotation-dialog";

export interface AdvancedImageAnnotatorProps {
    imageUrl: string;
    initialAnnotations?: ImageAnnotation[];
    /** Zoom/pan salvos — restaurados uma vez quando o stage estiver pronto. */
    initialViewport?: AnnotatorViewportState | null;
    onSave?: (
        annotations: ImageAnnotation[],
        composedImageBlob: Blob,
        isAutoSave?: boolean,
        editorViewport?: AnnotatorViewportState
    ) => Promise<void>;
    availableItems?: BudgetItem[]; // Itens ricos (BudgetItem com product_id populado)
    readOnly?: boolean;
    width?: number;
    height?: number;
    sectionId?: string;
    budgetId?: string;
    onProductAddedToBudget?: () => void;
    /** Chamado sempre que as anotações mudam (para detectar alterações não salvas) */
    onAnnotationsChange?: () => void;
}

export function AdvancedImageAnnotator({
    imageUrl,
    initialAnnotations = [],
    initialViewport = null,
    onSave,
    availableItems = [],
    readOnly = false,
    width = 800,
    height = 600,
    sectionId,
    budgetId,
    onProductAddedToBudget,
    onAnnotationsChange,
}: AdvancedImageAnnotatorProps) {
    const [annotations, setAnnotations] = useState<ImageAnnotation[]>(initialAnnotations);
    // Wrapper que notifica o pai quando as anotações mudam
    const updateAnnotations = useCallback((newAnnotations: ImageAnnotation[] | ((prev: ImageAnnotation[]) => ImageAnnotation[])) => {
        setAnnotations(newAnnotations);
        onAnnotationsChange?.();
    }, [onAnnotationsChange]);
    const [selectedTool, setSelectedTool] = useState<ToolType>('select');
    const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
    const [stepCounter, setStepCounter] = useState(1);
    const [isSaving, setIsSaving] = useState(false);
    const [catalogDockOpen, setCatalogDockOpen] = useState(true);
    /** Incrementado pelo botão da toolbar: aba Grupo + expandir (lista filtrada ou catálogo completo). */
    const [expandAllGroupsSignal, setExpandAllGroupsSignal] = useState(0);
    /** Com orçamento: true = aba Grupo mostra todos os grupos do cadastro, não só os do orçamento. */
    const [showAllCatalogGroups, setShowAllCatalogGroups] = useState(false);
    /** Com `budgetId`: IDs de grupo usados no orçamento para filtrar a aba Grupo. */
    const [budgetUsedGroupIds, setBudgetUsedGroupIds] = useState<string[] | undefined>(undefined);
    const [budgetUsedGroupIdsLoading, setBudgetUsedGroupIdsLoading] = useState(false);
    /** Incrementado após mutar itens do orçamento a partir do anotador (atualiza filtro de grupos). */
    const [budgetUsedGroupIdsVersion, setBudgetUsedGroupIdsVersion] = useState(0);

    useEffect(() => {
        if (!budgetId) {
            setBudgetUsedGroupIds(undefined);
            setBudgetUsedGroupIdsLoading(false);
            setShowAllCatalogGroups(false);
            return;
        }
        let cancelled = false;
        setBudgetUsedGroupIds(undefined);
        setBudgetUsedGroupIdsLoading(true);
        getBudgetUsedProductGroupIdsAction(budgetId).then((res) => {
            if (cancelled) return;
            setBudgetUsedGroupIdsLoading(false);
            setBudgetUsedGroupIds(res.success && res.data ? res.data : []);
        });
        return () => {
            cancelled = true;
        };
    }, [budgetId, budgetUsedGroupIdsVersion]);

    // Zoom e pan
    const [stageScale, setStageScale] = useState(1);
    const [isSpaceDown, setIsSpaceDown] = useState(false);

    // Estado para edição via Dialog
    const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");
    const [editLinkedItemId, setEditLinkedItemId] = useState<string | null>(null);
    const [editToolType, setEditToolType] = useState<ToolType | null>(null);
    const [editFontColor, setEditFontColor] = useState<string>(DEFAULT_STYLE.color);
    const [editStrokeColor, setEditStrokeColor] = useState<string>('');
    const [editTextStrokeWidth, setEditTextStrokeWidth] = useState<number>(0);
    const [editBorderColor, setEditBorderColor] = useState<string>('');
    const [editFontSize, setEditFontSize] = useState<number>(14);

    // Ref e estado para controle de Auto-Save
    const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isInitialRender = useRef(true);

    // Estado para criação de setas
    const [isDrawingArrow, setIsDrawingArrow] = useState(false);
    const [arrowStartPoint, setArrowStartPoint] = useState<{ x: number; y: number } | null>(null);
    const [tempArrowEnd, setTempArrowEnd] = useState<{ x: number; y: number } | null>(null);

    // Estado para criação de retângulos
    const [isDrawingRect, setIsDrawingRect] = useState(false);
    const [rectStartPoint, setRectStartPoint] = useState<{ x: number; y: number } | null>(null);
    const [tempRectEnd, setTempRectEnd] = useState<{ x: number; y: number } | null>(null);

    // Estado para criação de polylines
    const [isDrawingPolyline, setIsDrawingPolyline] = useState(false);
    const [polylinePoints, setPolylinePoints] = useState<Point[]>([]);
    const [polylineTempEnd, setPolylineTempEnd] = useState<Point | null>(null);
    const polylinePointsRef = useRef<Point[]>([]); // sync para dblclick sem closure stale

    const [editPolylineStrokeWidth, setEditPolylineStrokeWidth] = useState<number>(2);
    const [editPolylineLineStyle, setEditPolylineLineStyle] = useState<'solid' | 'dashed' | 'dotted'>('solid');

    // Estado para dialog de inserir imagem
    const [insertImageDialogOpen, setInsertImageDialogOpen] = useState(false);

    const stageRef = useRef<Konva.Stage>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    /** Evita reaplicar zoom em todo resize; zera ao mudar `imageUrl`. */
    const viewportApplyMarkerRef = useRef<string>("");
    const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);

    // Medir container real (responsivo) para manter proporção e ocupar o máximo possível.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const measure = () => {
            const next = {
                width: el.clientWidth,
                height: el.clientHeight,
            };
            setContainerSize((prev) => {
                if (!prev) return next;
                if (prev.width === next.width && prev.height === next.height) return prev;
                return next;
            });
        };

        measure();

        // ResizeObserver é o caminho mais confiável para modal fullscreen
        const ro = new ResizeObserver(() => measure());
        ro.observe(el);
        return () => ro.disconnect();
    }, [image]);

    const [imageLoadError, setImageLoadError] = useState<string | null>(null);

    // Carregar imagem
    useEffect(() => {
        if (!imageUrl?.trim()) {
            setImage(null);
            setImageLoadError(null);
            return;
        }
        setImageLoadError(null);
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            setImage(img);
        };
        img.onerror = () => {
            setImage(null);
            setImageLoadError(`Não foi possível carregar a imagem. Verifique se o arquivo existe.`);
        };
        img.src = imageUrl;
    }, [imageUrl]);

    // Imagem preenche o viewport inteiro (sem padding) — espaço extra acessível via pan
    // O fundo branco se estende 4000px em cada direção além da imagem
    useEffect(() => {
        if (!image) return;
        const aspectRatio = image.width / image.height;
        const cw = containerSize?.width ?? width;
        const ch = containerSize?.height ?? height;
        if (!cw || !ch) return;

        let newWidth = cw;
        let newHeight = cw / aspectRatio;

        if (newHeight > ch) {
            newHeight = ch;
            newWidth = ch * aspectRatio;
        }

        setImageSize({ width: Math.round(newWidth), height: Math.round(newHeight) });
    }, [image, containerSize, width, height]);

    // Atualizar contador de steps
    useEffect(() => {
        const stepAnnotations = annotations.filter(a => a.tool_type === 'step_number');
        if (stepAnnotations.length > 0) {
            const maxNumber = Math.max(...stepAnnotations.map((a) => (a as StepAnnotation).number || 0));
            setStepCounter(maxNumber + 1);
        }
    }, [annotations]);

    // Troca de imagem: zera marca de viewport (aplicação ocorre no efeito seguinte).
    useEffect(() => {
        viewportApplyMarkerRef.current = "";
    }, [imageUrl]);

    // Quando trocar imagem ou anotações vindas de fora, reseta ferramentas/seleção — **sem** resetar zoom
    // (zoom só muda na troca de `imageUrl` via efeito de viewport ou interação do usuário).
    useEffect(() => {
        setAnnotations(initialAnnotations || []);
        setSelectedTool('select');
        setSelectedAnnotationId(null);
        setEditingAnnotationId(null);
        setEditText("");
        setEditLinkedItemId(null);
        setEditToolType(null);
        setIsDrawingArrow(false);
        setArrowStartPoint(null);
        setTempArrowEnd(null);
        setIsDrawingRect(false);
        setRectStartPoint(null);
        setTempRectEnd(null);
        setIsDrawingPolyline(false);
        setPolylinePoints([]);
        polylinePointsRef.current = [];
        setPolylineTempEnd(null);
    }, [imageUrl, initialAnnotations]);

    // Aplica zoom/pan salvo uma vez por imagem (usa mesma lógica de `stageSize` sem depender de hook após const).
    useEffect(() => {
        const sw = containerSize?.width ?? width;
        if (viewportApplyMarkerRef.current === imageUrl) return;
        if (!image || imageSize.width <= 0 || sw <= 0) return;
        const stage = stageRef.current;
        if (!stage) return;

        viewportApplyMarkerRef.current = imageUrl;

        const v = initialViewport;
        if (v && Number.isFinite(v.scale) && v.scale >= 0.25 && v.scale <= 4) {
            stage.scale({ x: v.scale, y: v.scale });
            stage.position({ x: v.x, y: v.y });
            setStageScale(v.scale);
        } else {
            stage.scale({ x: 1, y: 1 });
            stage.position({ x: 0, y: 0 });
            setStageScale(1);
        }
        stage.batchDraw();
    }, [
        imageUrl,
        image,
        imageSize.width,
        imageSize.height,
        containerSize?.width,
        containerSize?.height,
        width,
        height,
        initialViewport,
    ]);

    // --- AUTO SAVE ---
    useEffect(() => {
        if (isInitialRender.current) {
            isInitialRender.current = false;
            return;
        }
        if (readOnly || !onSave) return;

        if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = setTimeout(() => {
            handleSave(true);
        }, 1500);

        return () => {
            if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [annotations]);

    const handleAnnotationDelete = useCallback((id: string) => {
        updateAnnotations(prev => {
            const target = prev.find(a => a.id === id);
            if (target?.tool_type === 'product_sticker') {
                // Remover sticker e todas as setas vinculadas a ele em cascata
                return prev.filter(a =>
                    a.id !== id &&
                    !(a.tool_type === 'arrow' && (a as ArrowAnnotation).linked_from_sticker_id === id)
                );
            }
            return prev.filter(a => a.id !== id);
        });
        setSelectedAnnotationId(null);
    }, [updateAnnotations]);

    const handleCreateLinkedArrow = useCallback((stickerId: string, startRel: Point, endRel: Point) => {
        const newArrow: ArrowAnnotation = {
            id: generateAnnotationId(),
            tool_type: 'arrow',
            points: [startRel, endRel],
            pointerLength: 15,
            pointerWidth: 15,
            linked_from_sticker_id: stickerId,
            style: { ...DEFAULT_STYLE },
        };
        updateAnnotations(prev => [...prev, newArrow]);
        setSelectedTool('select');
    }, [updateAnnotations]);

    // Keyboard support — Delete/Backspace para remover anotação selecionada
    useEffect(() => {
        if (readOnly) return;
        if (editingAnnotationId) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotationId) {
                e.preventDefault();
                handleAnnotationDelete(selectedAnnotationId);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedAnnotationId, readOnly, editingAnnotationId, handleAnnotationDelete]);

    // Space key para pan — separado para não interferir com inputs
    useEffect(() => {
        if (readOnly) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.code === 'Space') {
                e.preventDefault();
                setIsSpaceDown(true);
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') setIsSpaceDown(false);
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [readOnly]);

    // --- ZOOM E PAN ---

    // Tamanho do stage = container completo (workspace)
    const stageSize = containerSize ?? { width: width, height: height };
    // Imagem centralizada no stage
    const imageOffset = imageSize.width > 0 ? {
        x: Math.round((stageSize.width - imageSize.width) / 2),
        y: Math.round((stageSize.height - imageSize.height) / 2),
    } : { x: 0, y: 0 };

    // Retorna posição do ponteiro em coordenadas relativas à imagem (descontando zoom/pan e offset).
    const getContentPointerPos = (stage: Konva.Stage) => {
        const pos = stage.getPointerPosition();
        if (!pos) return null;
        return {
            x: (pos.x - stage.x()) / stage.scaleX() - imageOffset.x,
            y: (pos.y - stage.y()) / stage.scaleY() - imageOffset.y,
        };
    };

    const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();
        const stage = stageRef.current;
        if (!stage) return;

        const scaleBy = 1.08;
        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        const newScale = e.evt.deltaY > 0
            ? Math.max(0.25, oldScale / scaleBy)
            : Math.min(4.0, oldScale * scaleBy);

        const mousePointTo = {
            x: (pointer.x - stage.x()) / oldScale,
            y: (pointer.y - stage.y()) / oldScale,
        };

        stage.scale({ x: newScale, y: newScale });
        stage.position({
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        });
        stage.batchDraw();
        setStageScale(newScale);
    };

    const handleResetZoom = () => {
        const stage = stageRef.current;
        if (!stage) return;
        stage.scale({ x: 1, y: 1 });
        stage.position({ x: 0, y: 0 });
        stage.batchDraw();
        setStageScale(1);
    };

    // --- DRAG AND DROP HANDLERS (Product Dock) ---

    const handleDragStartItem = (e: DragEvent, item: BudgetItem) => {
        if (readOnly) return;
        const product = (typeof item.product_id === 'object' ? item.product_id : {}) as Record<string, string | undefined>;
        e.dataTransfer.setData('product_id', product.id || '');
        e.dataTransfer.setData('image_url', product.imageUrl || '');
        e.dataTransfer.setData('product_name', product.description || 'Produto');
        e.dataTransfer.setData('item_id', item.id || '');
        e.dataTransfer.setData('source', 'budget');
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleDragStartCatalogProduct = (e: DragEvent, product: Product) => {
        if (readOnly) return;
        e.dataTransfer.setData('product_id', product.id || '');
        e.dataTransfer.setData('image_url', product.imageUrl || '');
        e.dataTransfer.setData('product_name', product.description || 'Produto');
        e.dataTransfer.setData('item_id', '');
        e.dataTransfer.setData('source', 'catalog');
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleDragStartCatalogGroup = (e: DragEvent, group: ProductGroup) => {
        if (readOnly) return;
        e.dataTransfer.setData('product_id', ''); // Grupos não tem um produto final a adicionar
        e.dataTransfer.setData('image_url', group.image_url || '');
        e.dataTransfer.setData('product_name', group.name || 'Grupo');
        e.dataTransfer.setData('item_id', '');
        e.dataTransfer.setData('source', 'catalog_group');
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleDragOverStage = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    };

    const handleDropOnStage = async (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (readOnly) return;

        const stage = stageRef.current;
        if (!stage) return;

        // Precisamos atualizar o pointer position do Konva manualmente com o evento nativo
        stage.setPointersPositions(e);
        const pointerPosition = stage.getPointerPosition();
        if (!pointerPosition) return;

        // Ajustar para espaço de conteúdo (zoom/pan) e subtrair offset da imagem
        const contentX = (pointerPosition.x - stage.x()) / stage.scaleX() - imageOffset.x;
        const contentY = (pointerPosition.y - stage.y()) / stage.scaleY() - imageOffset.y;

        const relativePos = toRelativeCoordinates(
            contentX,
            contentY,
            imageSize.width,
            imageSize.height
        );

        const productId = e.dataTransfer.getData('product_id');
        const source = e.dataTransfer.getData('source');
        const stickerImageUrl = e.dataTransfer.getData('image_url');
        const productName = e.dataTransfer.getData('product_name');
        const itemId = e.dataTransfer.getData('item_id');

        // Se soltou um item arrastável
        if (source) {
            // Auto-add ao orçamento se veio do catálogo E for um produto real (não grupo)
            if (source === 'catalog' && sectionId && budgetId && productId) {
                try {
                    const res = await addItemAction(sectionId, budgetId, productId, 1);
                    if (res.success) {
                        toast.success(`"${productName}" adicionado ao orçamento`);
                        onProductAddedToBudget?.();
                        setBudgetUsedGroupIdsVersion((v) => v + 1);
                    } else {
                        toast.error(res.error || "Erro ao adicionar produto ao orçamento");
                    }
                } catch {
                    toast.error("Erro ao adicionar produto ao orçamento");
                }
            }

            // Carregar dimensões reais para manter proporção
            const dims = await new Promise<{ width: number; height: number }>((resolve) => {
                if (!stickerImageUrl) return resolve({ width: 100, height: 100 });
                const img = new window.Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
                img.onerror = () => resolve({ width: 100, height: 100 });
                img.src = stickerImageUrl;
            });
            const MAX_SIZE = 150;
            const ratio = Math.min(MAX_SIZE / dims.width, MAX_SIZE / dims.height);
            const w = Math.max(40, Math.round(dims.width * ratio));
            const h = Math.max(40, Math.round(dims.height * ratio));

            const newSticker: StickerAnnotation = {
                id: generateAnnotationId(),
                tool_type: 'product_sticker',
                position: relativePos,
                width: w,
                height: h,
                image_url: stickerImageUrl,
                product_name: productName,
                linked_item_id: itemId,
                style: { ...DEFAULT_STYLE, opacity: 1 }
            };

            updateAnnotations([...annotations, newSticker]);
            setSelectedTool('select');
        }
    };


    // --- KONVA EVENTS ---

    const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
        if (readOnly) return;
        if (selectedTool !== 'arrow' && selectedTool !== 'rect') return;

        const stage = e.target.getStage();
        if (!stage) return;
        const pointerPosition = getContentPointerPos(stage);
        if (!pointerPosition) return;

        const relativePos = toRelativeCoordinates(pointerPosition.x, pointerPosition.y, imageSize.width, imageSize.height);

        if (selectedTool === 'arrow') {
            setIsDrawingArrow(true);
            setArrowStartPoint(relativePos);
            setTempArrowEnd(relativePos);
        } else if (selectedTool === 'rect') {
            setIsDrawingRect(true);
            setRectStartPoint(relativePos);
            setTempRectEnd(relativePos);
        }
    };

    const handleStageMouseMove = (e: KonvaEventObject<MouseEvent>) => {
        const drawingArrow = isDrawingArrow && selectedTool === 'arrow';
        const drawingRect = isDrawingRect && selectedTool === 'rect';
        const drawingPolyline = isDrawingPolyline && selectedTool === 'polyline';
        if (!drawingArrow && !drawingRect && !drawingPolyline) return;

        const stage = e.target.getStage();
        if (!stage) return;
        const pointerPosition = getContentPointerPos(stage);
        if (!pointerPosition) return;

        const relativePos = toRelativeCoordinates(pointerPosition.x, pointerPosition.y, imageSize.width, imageSize.height);

        if (drawingArrow) setTempArrowEnd(relativePos);
        if (drawingRect) setTempRectEnd(relativePos);
        if (drawingPolyline) setPolylineTempEnd(relativePos);
    };

    const handleStageMouseUp = () => {
        if (isDrawingArrow && arrowStartPoint && tempArrowEnd) {
            const distance = Math.sqrt(Math.pow(tempArrowEnd.x - arrowStartPoint.x, 2) + Math.pow(tempArrowEnd.y - arrowStartPoint.y, 2));
            if (distance > 0.02) {
                const newAnnotation: ImageAnnotation = {
                    id: generateAnnotationId(),
                    tool_type: 'arrow',
                    points: [arrowStartPoint, tempArrowEnd],
                    pointerLength: 15,
                    pointerWidth: 15,
                    style: { ...DEFAULT_STYLE }
                };
                updateAnnotations((prev) => [...prev, newAnnotation]);
            }
            setIsDrawingArrow(false); setArrowStartPoint(null); setTempArrowEnd(null); setSelectedTool('select');
        } else if (isDrawingRect && rectStartPoint && tempRectEnd) {
            const width = Math.abs(tempRectEnd.x - rectStartPoint.x);
            const height = Math.abs(tempRectEnd.y - rectStartPoint.y);
            if (width > 0.02 && height > 0.02) {
                const newAnnotation: ImageAnnotation = {
                    id: generateAnnotationId(),
                    tool_type: 'rect',
                    position: { x: Math.min(rectStartPoint.x, tempRectEnd.x), y: Math.min(rectStartPoint.y, tempRectEnd.y) },
                    // Mantemos width/height RELATIVOS (0-1) para preservar proporção ao reabrir/redimensionar.
                    width,
                    height,
                    style: { ...DEFAULT_STYLE, color: '#FF3333', strokeWidth: 3 }
                };
                updateAnnotations((prev) => [...prev, newAnnotation]);
            }
            setIsDrawingRect(false); setRectStartPoint(null); setTempRectEnd(null); setSelectedTool('select');
        }
    };

    const handleStageClick = (e: KonvaEventObject<MouseEvent>) => {
        if (readOnly) return;
        if (e.target === e.target.getStage() || e.target.name() === 'background') {
            setSelectedAnnotationId(null);
        }
        if (selectedTool === 'select' || selectedTool === 'arrow') return;

        const stage = e.target.getStage();
        if (!stage) return;
        const pointerPosition = getContentPointerPos(stage);
        if (!pointerPosition) return;
        const relativePos = toRelativeCoordinates(pointerPosition.x, pointerPosition.y, imageSize.width, imageSize.height);

        if (selectedTool === 'step_number') {
            updateAnnotations([...annotations, {
                id: generateAnnotationId(),
                tool_type: 'step_number',
                position: relativePos,
                number: stepCounter,
                radius: 20,
                style: { ...DEFAULT_STYLE }
            }]);
            setStepCounter(stepCounter + 1);
            setSelectedTool('select');
        } else if (selectedTool === 'text') {
            updateAnnotations([...annotations, {
                id: generateAnnotationId(),
                tool_type: 'text',
                position: relativePos,
                content: '',
                fontSize: 14, width: 200, padding: 8, backgroundColor: 'transparent',
                style: { ...DEFAULT_STYLE }
            }]);
            setSelectedTool('select');
        } else if (selectedTool === 'polyline') {
            setIsDrawingPolyline(true);
            setPolylinePoints(prev => {
                const next = [...prev, relativePos];
                polylinePointsRef.current = next;
                return next;
            });
            return;
        }
    };

    const handleAnnotationSelect = (id: string) => {
        setSelectedAnnotationId(id);
        setSelectedTool('select');
    };

    const handleAnnotationUpdate = (id: string, updates: Partial<ImageAnnotation>) => {
        updateAnnotations(annotations.map(a => a.id === id ? { ...a, ...updates } as ImageAnnotation : a));
    };

    const handleInsertImage = async (imageUrl: string, label: string) => {
        // Carregar imagem para obter dimensões reais e manter proporção
        const dims = await new Promise<{ width: number; height: number }>((resolve) => {
            const img = new window.Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = () => resolve({ width: 120, height: 120 });
            img.src = imageUrl;
        });

        // Limitar ao lado maior em 150px mantendo proporção
        const MAX_SIZE = 150;
        const ratio = Math.min(MAX_SIZE / dims.width, MAX_SIZE / dims.height);
        const w = Math.max(40, Math.round(dims.width * ratio));
        const h = Math.max(40, Math.round(dims.height * ratio));

        const newSticker: StickerAnnotation = {
            id: generateAnnotationId(),
            tool_type: 'product_sticker',
            position: { x: 0.5, y: 0.5 },
            width: w,
            height: h,
            image_url: imageUrl,
            product_name: label,
            style: { ...DEFAULT_STYLE, opacity: 1 }
        };
        updateAnnotations([...annotations, newSticker]);
        setInsertImageDialogOpen(false);
        setSelectedTool('select');
    };

    const handleEditStart = (id: string, toolType: 'text' | 'step_number' | 'polyline') => {
        if (readOnly) return;
        const annotation = annotations.find(a => a.id === id);
        if (annotation) {
            setEditText(annotation.content || "");
            setEditLinkedItemId(annotation.linked_item_id || null);
            setEditToolType(toolType);
            setEditingAnnotationId(id);
            if (toolType === 'text') {
                const textAnn = annotation as TextAnnotation;
                setEditFontColor(textAnn.fontColor || textAnn.style.color);
                setEditStrokeColor(textAnn.strokeColor || '');
                setEditTextStrokeWidth(textAnn.textStrokeWidth || 0);
                setEditBorderColor(textAnn.borderColor || '');
                setEditFontSize(textAnn.fontSize || 14);
                setTimeout(() => document.getElementById('annotation-text-input')?.focus(), 100);
            }
            if (toolType === 'polyline') {
                const polyline = annotation as PolylineAnnotation;
                setEditFontColor(polyline.style.color);
                setEditPolylineStrokeWidth(polyline.strokeWidth || 2);
                setEditPolylineLineStyle(polyline.lineStyle || 'solid');
            }
        }
    };

    const handleEditSave = () => {
        if (editingAnnotationId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const updates: any = {};
            if (editToolType === 'text') {
                updates.content = editText;
                updates.fontColor = editFontColor;
                updates.strokeColor = editStrokeColor || undefined;
                updates.textStrokeWidth = editTextStrokeWidth;
                updates.borderColor = editBorderColor || undefined;
                updates.fontSize = editFontSize;
            }
            if (editToolType === 'polyline') {
                updates.style = { ...DEFAULT_STYLE, color: editFontColor };
                updates.strokeWidth = editPolylineStrokeWidth;
                updates.lineStyle = editPolylineLineStyle;
            }
            if (editLinkedItemId) updates.linked_item_id = editLinkedItemId === 'none_selection_special_id' ? undefined : editLinkedItemId;

            handleAnnotationUpdate(editingAnnotationId, updates);
            setEditingAnnotationId(null); setEditText(""); setEditLinkedItemId(null); setEditToolType(null);
        }
    };

    const handleEditCancel = (open: boolean) => {
        if (!open) {
            setEditingAnnotationId(null);
        }
    };

    const handleStageDblClick = (e: KonvaEventObject<MouseEvent>) => {
        if (readOnly || selectedTool !== 'polyline' || !isDrawingPolyline) return;
        // O dblclick é precedido por 2 clicks, então o último ponto é duplicata — remover
        const pts = polylinePointsRef.current.slice(0, -1);
        polylinePointsRef.current = [];
        setPolylinePoints([]);
        setIsDrawingPolyline(false);
        setPolylineTempEnd(null);
        if (pts.length >= 2) {
            const newAnnotation: PolylineAnnotation = {
                id: generateAnnotationId(),
                tool_type: 'polyline',
                points: pts,
                lineStyle: 'solid',
                strokeWidth: 2,
                style: { ...DEFAULT_STYLE },
            };
            updateAnnotations(prev => [...prev, newAnnotation]);
            // Abrir dialog de configuração automaticamente
            setEditingAnnotationId(newAnnotation.id);
            setEditToolType('polyline');
            setEditFontColor(DEFAULT_STYLE.color);
            setEditPolylineStrokeWidth(2);
            setEditPolylineLineStyle('solid');
            setSelectedTool('select');
        }
        e.cancelBubble = true;
    };

    // Escape cancela desenho de polyline em andamento
    useEffect(() => {
        if (!isDrawingPolyline) return;
        const handleEscKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                setIsDrawingPolyline(false);
                setPolylinePoints([]);
                polylinePointsRef.current = [];
                setPolylineTempEnd(null);
                setSelectedTool('select');
            }
        };
        window.addEventListener('keydown', handleEscKey);
        return () => window.removeEventListener('keydown', handleEscKey);
    }, [isDrawingPolyline]);

    const handleSave = async (isAutoSave = false) => {
        if (!onSave || !stageRef.current) return;
        setIsSaving(true);
        try {
            // Deselecionar para não capturar borda do Transformer na imagem exportada
            setSelectedAnnotationId(null);
            // Aguardar re-render para o Transformer sumir do canvas
            await new Promise(r => setTimeout(r, 50));

            const stage = stageRef.current;
            const savedScale = stage.scaleX();
            const savedPos = { x: stage.x(), y: stage.y() };

            // Fazer reset, export e restore no mesmo frame de animação para evitar "pulinho" visual
            const blob = await new Promise<Blob>((resolve, reject) => {
                requestAnimationFrame(() => {
                    stage.scale({ x: 1, y: 1 });
                    stage.position({ x: 0, y: 0 });
                    stage.batchDraw();

                    const bbox = computeAnnotatorContentBBox(annotations, imageOffset, imageSize);
                    const SAVE_MARGIN = 24;
                    const canvas = stage.toCanvas({
                        x: Math.floor(bbox.x - SAVE_MARGIN),
                        y: Math.floor(bbox.y - SAVE_MARGIN),
                        width: Math.ceil(bbox.width + 2 * SAVE_MARGIN),
                        height: Math.ceil(bbox.height + 2 * SAVE_MARGIN),
                        pixelRatio: 2,
                    });

                    // Restaurar zoom/pan antes de qualquer await, no mesmo frame
                    stage.scale({ x: savedScale, y: savedScale });
                    stage.position(savedPos);
                    stage.batchDraw();

                    canvas.toBlob((b) => {
                        if (b) resolve(b);
                        else reject(new Error("Falha ao gerar blob da composição"));
                    }, "image/jpeg", 0.92);
                });
            });

            await onSave(annotations, blob, isAutoSave, {
                scale: savedScale,
                x: savedPos.x,
                y: savedPos.y,
            });
        } catch (error) {
            console.error('Erro ao salvar:', error);
            toast.error("Erro ao salvar anotações");
        } finally {
            setIsSaving(false);
        }
    };

    if (!image) {
        return (
            <div className="flex items-center justify-center h-96 bg-muted/10 rounded-lg px-4 text-center">
                <p className={imageLoadError ? "text-destructive text-sm" : "text-sm text-muted-foreground"}>
                    {imageLoadError ?? "Carregando imagem..."}
                </p>
            </div>
        );
    }

    const dialogTitle =
        editToolType === "text"
            ? "Editar Texto"
            : editToolType === "polyline"
              ? "Estilo da Linha"
              : "Vincular Item";
    const dialogDescription =
        editToolType === "text"
            ? "Digite o texto."
            : editToolType === "polyline"
              ? "Configure o estilo da linha poligonal."
              : "Vincular esta anotação.";

    return (
        <div className="flex flex-col gap-4 h-full min-h-0">
            {!readOnly && (
                <Toolbar
                    selectedTool={selectedTool}
                    onToolSelect={setSelectedTool}
                    onDelete={() => selectedAnnotationId && handleAnnotationDelete(selectedAnnotationId)}
                    canDelete={!!selectedAnnotationId}
                    onInsertImage={() => setInsertImageDialogOpen(true)}
                    onToggleCatalog={() => setCatalogDockOpen((v) => !v)}
                    catalogOpen={catalogDockOpen}
                    onExpandAllCatalogGroups={() => {
                        if (budgetId) setShowAllCatalogGroups((v) => !v);
                        setExpandAllGroupsSignal((n) => n + 1);
                    }}
                    catalogShowAllGroupsActive={!!budgetId && showAllCatalogGroups}
                    catalogHasBudgetFilter={!!budgetId}
                    isSaving={isSaving}
                    onSave={() => handleSave(false)}
                />
            )}

            <div className="flex gap-4 flex-1 min-h-0">

                {/* DOCK LATERAL — abas Orçamento + Grupo (grupos filtrados pelos itens do orçamento quando há budgetId) */}
                {!readOnly && (
                    <div className={catalogDockOpen ? 'flex min-w-0' : 'w-0 overflow-hidden min-w-0'}>
                        <CatalogDock
                            availableItems={availableItems}
                            onDragStartBudgetItem={handleDragStartItem}
                            onDragStartCatalogProduct={handleDragStartCatalogProduct}
                            onDragStartCatalogGroup={handleDragStartCatalogGroup}
                            budgetUsedGroupIds={budgetId ? budgetUsedGroupIds : undefined}
                            budgetUsedGroupIdsLoading={!!budgetId && budgetUsedGroupIdsLoading}
                            showAllProductGroups={!!budgetId && showAllCatalogGroups}
                            expandAllGroupsSignal={expandAllGroupsSignal}
                        />
                    </div>
                )}


                <AnnotatorKonvaWorkspace
                    containerRef={containerRef}
                    readOnly={readOnly}
                    isSpaceDown={isSpaceDown}
                    onDrop={handleDropOnStage}
                    onDragOver={handleDragOverStage}
                    imageSize={imageSize}
                    stageSize={stageSize}
                    imageOffset={imageOffset}
                    image={image}
                    stageRef={stageRef}
                    stageScale={stageScale}
                    onResetZoom={handleResetZoom}
                    onStageClick={handleStageClick}
                    onStageDblClick={handleStageDblClick}
                    onStageMouseDown={handleStageMouseDown}
                    onStageMouseMove={handleStageMouseMove}
                    onStageMouseUp={handleStageMouseUp}
                    onWheel={handleWheel}
                    stageDraggable={isSpaceDown && !readOnly}
                    annotations={annotations}
                    selectedAnnotationId={selectedAnnotationId}
                    onAnnotationSelect={handleAnnotationSelect}
                    onAnnotationUpdate={handleAnnotationUpdate}
                    onEditStart={handleEditStart}
                    onCreateLinkedArrow={handleCreateLinkedArrow}
                    isDrawingArrow={isDrawingArrow}
                    arrowStartPoint={arrowStartPoint}
                    tempArrowEnd={tempArrowEnd}
                    isDrawingRect={isDrawingRect}
                    rectStartPoint={rectStartPoint}
                    tempRectEnd={tempRectEnd}
                    isDrawingPolyline={isDrawingPolyline}
                    polylinePoints={polylinePoints}
                    polylineTempEnd={polylineTempEnd}
                />
            </div>

            <AnnotatorEditAnnotationDialog
                open={!!editingAnnotationId}
                onOpenChange={handleEditCancel}
                dialogTitle={dialogTitle}
                dialogDescription={dialogDescription}
                editToolType={editToolType}
                editText={editText}
                setEditText={setEditText}
                editFontSize={editFontSize}
                setEditFontSize={setEditFontSize}
                editFontColor={editFontColor}
                setEditFontColor={setEditFontColor}
                editStrokeColor={editStrokeColor}
                setEditStrokeColor={setEditStrokeColor}
                editTextStrokeWidth={editTextStrokeWidth}
                setEditTextStrokeWidth={setEditTextStrokeWidth}
                editBorderColor={editBorderColor}
                setEditBorderColor={setEditBorderColor}
                editPolylineStrokeWidth={editPolylineStrokeWidth}
                setEditPolylineStrokeWidth={setEditPolylineStrokeWidth}
                editPolylineLineStyle={editPolylineLineStyle}
                setEditPolylineLineStyle={setEditPolylineLineStyle}
                availableItems={availableItems}
                editLinkedItemId={editLinkedItemId}
                setEditLinkedItemId={setEditLinkedItemId}
                onSave={handleEditSave}
            />

            {/* Insert Image Dialog */}
            {!readOnly && (
                <InsertImageDialog
                    open={insertImageDialogOpen}
                    onOpenChange={setInsertImageDialogOpen}
                    onSelectImage={handleInsertImage}
                />
            )}
        </div>
    );
}

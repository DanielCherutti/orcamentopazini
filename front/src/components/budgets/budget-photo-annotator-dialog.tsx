"use client";

import { useEffect, useId, useRef, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, X } from 'lucide-react';
import { AdvancedImageAnnotator } from '@/components/annotator/advanced-image-annotator';
import { saveBudgetImageWithAnnotations } from '@/actions/budget-annotations';
import { ImageAnnotation } from '@/components/annotator/tools/types';
import type { AnnotatorViewportState } from '@/components/annotator/annotator-viewport-types';
import { BudgetItem } from '@/types/budget-types';
import { toast } from '@/lib/toast';

const MAX_FILE_SIZE_MB = 20;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface BudgetPhotoAnnotatorDialogProps {
    budgetId: string;
    sectionId?: string;
    locationId?: string;
    /** Compositor: referência ao budget_block (alternativa a sectionId/locationId) */
    blockId?: string;
    /** Se definido, entra em modo EDIÇÃO — atualiza o registro existente */
    imageId?: string;
    availableItems?: BudgetItem[];
    trigger?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onSaved?: () => void;
    /** Callback para refresh dos dados do compositor (quando produto é auto-adicionado) */
    onRefresh?: () => void;
    /** URL da imagem ORIGINAL (não composta) — usada no modo edição */
    initialImageUrl?: string | null;
    initialAnnotations?: ImageAnnotation[];
    /** Zoom/pan salvos no registro da imagem — restaurados ao abrir o anotador. */
    initialEditorViewport?: AnnotatorViewportState | null;
    /** Escopo (local/trecho): legenda obrigatória para a lista de figuras do documento */
    initialCaption?: string | null;
}

export function BudgetPhotoAnnotatorDialog({
    budgetId,
    sectionId,
    locationId,
    blockId,
    imageId,
    availableItems = [],
    trigger,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
    onSaved,
    onRefresh,
    initialImageUrl = null,
    initialAnnotations = [],
    initialEditorViewport = null,
    initialCaption = null,
}: BudgetPhotoAnnotatorDialogProps) {
    const isControlled = controlledOpen !== undefined;
    const [internalOpen, setInternalOpen] = useState(false);
    const isOpen = isControlled ? controlledOpen! : internalOpen;
    const setOpen = isControlled
        ? (controlledOnOpenChange ?? (() => { }))
        : setInternalOpen;

    // ---------- estado do modo CRIAÇÃO ----------
    /** data URL gerada pelo FileReader para preview local */
    const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
    /** Arquivo original selecionado pelo usuário (só existe no modo criação) */
    const [originalFile, setOriginalFile] = useState<File | null>(null);
    /** Dimensões da imagem selecionada pelo usuário */
    const [originalDimensions, setOriginalDimensions] = useState({ width: 0, height: 0 });

    /** Dados da imagem criados no primeiro upload (para evitar duplicidade no autosave) */
    const [createdImageDoc, setCreatedImageDoc] = useState<{ id: string, url: string } | null>(null);

    // ---------- estado compartilhado ----------
    /**
     * URL/dataURL exibida no Konva.
     * - Modo CRIAÇÃO: data URL local (não tainted)
     * - Modo EDIÇÃO : URL do disco (/api/uploads/...) — canvas fica ok com CORS header
     */
    const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);

    const [sessionAnnotations, setSessionAnnotations] = useState<ImageAnnotation[]>(initialAnnotations);
    const [annotatorKey, setAnnotatorKey] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    // Controle de alerta de saída com alterações não salvas
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showExitAlert, setShowExitAlert] = useState(false);

    const fileInputId = useId();
    const captionFieldId = useId();
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const requiresCaption = !!(sectionId || locationId);
    const [figureCaption, setFigureCaption] = useState('');

    // ── Modo EDIÇÃO: carregar imagem original ao abrir ──────────────────────
    useEffect(() => {
        if (!isOpen) return;
        if (!initialImageUrl) return;
        if (activeImageUrl) return; // já carregado

        setSessionAnnotations(initialAnnotations);
        setActiveImageUrl(initialImageUrl);
        setAnnotatorKey((k) => k + 1);

        // Carregar dimensões da imagem original para uso no save
        const img = new Image();
        img.onload = () => setOriginalDimensions({ width: img.width, height: img.height });
        img.src = initialImageUrl;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, initialImageUrl]);

    useEffect(() => {
        if (!isOpen) return;
        if (imageId) {
            setFigureCaption(typeof initialCaption === 'string' ? initialCaption.trim() : '');
        } else {
            setFigureCaption('');
        }
    }, [isOpen, imageId, initialCaption]);

    // ── Limpar ao fechar ────────────────────────────────────────────────────
    const clearState = () => {
        setTimeout(() => {
            setPreviewDataUrl(null);
            setOriginalFile(null);
            setCreatedImageDoc(null);
            setActiveImageUrl(null);
            setSessionAnnotations([]);
            setHasUnsavedChanges(false);
            setFigureCaption('');
        }, 300);
    };

    // ── Marcar alterações ao anotar ──────────────────────────────────
    const handleAnnotationsChange = useCallback(() => {
        if (!hasUnsavedChanges) setHasUnsavedChanges(true);
    }, [hasUnsavedChanges]);

    // ── Processar arquivo (criação) ─────────────────────────────────────────
    const processFile = useCallback((file: File) => {
        if (!ACCEPTED_TYPES.includes(file.type)) {
            toast.error("Formato inválido. Use JPG, PNG ou WEBP.");
            return;
        }
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            toast.error(`Arquivo excede ${MAX_FILE_SIZE_MB}MB`);
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const dataUrl = ev.target?.result as string;
            const img = new Image();
            img.onload = () => {
                setOriginalDimensions({ width: img.width, height: img.height });
                setOriginalFile(file);
                setPreviewDataUrl(dataUrl);
                setActiveImageUrl(dataUrl);
                setSessionAnnotations([]);
                setAnnotatorKey((k) => k + 1);
                setHasUnsavedChanges(true); // nova imagem = alteração não salva
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
    }, []);

    // ── Seleção de arquivo (input) ─────────────────────────────────────────
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = "";
        processFile(file);
    };

    // ── Drag & Drop ─────────────────────────────────────────────────────────
    const [isDragOver, setIsDragOver] = useState(false);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (!activeImageUrl) setIsDragOver(true);
    };
    const handleDragLeave = () => setIsDragOver(false);
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processFile(file);
    };

    // ── Colar imagem (Ctrl+V) ───────────────────────────────────────────────
    useEffect(() => {
        if (!isOpen || activeImageUrl) return;
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of Array.from(items)) {
                if (item.type.startsWith("image/")) {
                    const file = item.getAsFile();
                    if (file) processFile(file);
                    break;
                }
            }
        };
        document.addEventListener("paste", handlePaste);
        return () => document.removeEventListener("paste", handlePaste);
    }, [isOpen, activeImageUrl, processFile]);

    const handleOpenChange = (open: boolean) => {
        if (!open && hasUnsavedChanges && activeImageUrl) {
            // Intercepta o fechamento e mostra alerta
            setShowExitAlert(true);
            return;
        }
        setOpen(open);
        if (!open) clearState();
    };

    const handleForceClose = () => {
        setShowExitAlert(false);
        setHasUnsavedChanges(false);
        setOpen(false);
        clearState();
    };

    // ── Upload de um blob para disco ────────────────────────────────────────
    const uploadBlob = async (blob: Blob, filename: string): Promise<string> => {
        const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload/budget/image", { method: "POST", body: fd });
        const json = await res.json() as { url?: string; error?: string };
        if (!res.ok || !json.url) throw new Error(json.error || `Upload falhou: ${res.statusText}`);
        return json.url;
    };

    // ── Salvar ──────────────────────────────────────────────────────────────
    /**
     * Recebe as anotações e o blob composto (canvas do Konva) do AdvancedImageAnnotator.
     *
     * Modo CRIAÇÃO  → upload original + upload composto → create no banco
     * Modo EDIÇÃO   → sem re-upload de original + upload novo composto → merge no banco
     */
    const handleSave = async (
        annotations: ImageAnnotation[],
        composedBlob: Blob,
        isAutoSave = false,
        editorViewport?: AnnotatorViewportState
    ) => {
        if (isAutoSave && requiresCaption && !figureCaption.trim()) {
            return;
        }
        if (requiresCaption && !figureCaption.trim()) {
            toast.error('Preencha a descrição da figura (lista de figuras no documento).');
            return;
        }

        setIsSaving(true);
        const activeImageId = imageId || createdImageDoc?.id;
        try {
            let originalUrl: string;

            if (activeImageId) {
                const activeOriginalUrl = initialImageUrl || createdImageDoc?.url;
                if (!activeOriginalUrl) throw new Error("URL da imagem original não encontrada.");
                originalUrl = activeOriginalUrl;
            } else {
                if (!originalFile) throw new Error("Nenhum arquivo selecionado.");
                originalUrl = await uploadBlob(originalFile, originalFile.name);
            }

            const composedUrl = await uploadBlob(composedBlob, "composed.jpg");

            const result = await saveBudgetImageWithAnnotations({
                budgetId,
                sectionId,
                locationId,
                blockId,
                imageId: activeImageId,
                url: originalUrl,
                composedUrl,
                width: originalDimensions.width || 0,
                height: originalDimensions.height || 0,
                annotations,
                editorViewport: editorViewport ?? null,
                ...(requiresCaption ? { caption: figureCaption.trim() } : {}),
            });

            if (result.success) {
                if (!activeImageId && result.imageId) {
                    setCreatedImageDoc({ id: result.imageId, url: originalUrl });
                }

                if (!isAutoSave) {
                    setHasUnsavedChanges(false);
                    toast.success("Foto e anotações salvas!");
                    setOpen(false);
                    clearState();
                    onSaved?.();
                } else {
                    // Autosave silencioso: marca como salvo
                    setHasUnsavedChanges(false);
                }
            } else {
                toast.error("Erro ao salvar: " + result.error);
            }
        } catch (err) {
            console.error("[handleSave] ERRO:", err);
            toast.error("Erro ao salvar: " + (err instanceof Error ? err.message : String(err)));
        } finally {
            setIsSaving(false);
        }
    };

    const isEditMode = !!imageId;
    const showUploadPrompt = !activeImageUrl;

    return (
        <>
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            {trigger && (
                <DialogTrigger asChild>
                    {trigger}
                </DialogTrigger>
            )}

            {/* 100% da área útil — fullscreen; sobrescreve max-w do Dialog */}
            <DialogContent className="!max-w-none !w-screen !h-screen !top-0 !left-0 !translate-x-0 !translate-y-0 rounded-none flex flex-col p-0 gap-0">
                <DialogDescription className="sr-only">
                    Área para enviar e anotar fotos do local do compositor. Arraste e solte ou escolha um arquivo.
                </DialogDescription>
                <DialogHeader className="px-4 py-2 shrink-0 border-b min-h-[3rem]">
                    <DialogTitle className="flex justify-between items-center">
                        <span>{isEditMode ? "Editar Anotações" : "Anotar Foto do Local"}</span>
                        <div className="flex items-center gap-2 min-h-[2rem]">
                            {isSaving ? (
                                <span className="flex items-center gap-1.5 text-sm font-normal text-muted-foreground">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Salvando...
                                </span>
                            ) : activeImageUrl && !isEditMode ? (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setPreviewDataUrl(null);
                                        setOriginalFile(null);
                                        setActiveImageUrl(null);
                                        setSessionAnnotations([]);
                                        setAnnotatorKey((k) => k + 1);
                                        if (fileInputRef.current) fileInputRef.current.value = "";
                                    }}
                                >
                                    <X className="h-4 w-4 mr-2" /> Trocar Imagem
                                </Button>
                            ) : null}
                        </div>
                    </DialogTitle>
                </DialogHeader>

                {requiresCaption && activeImageUrl ? (
                    <div className="shrink-0 space-y-1.5 border-b px-4 py-2">
                        <Label htmlFor={captionFieldId} className="text-xs font-medium">
                            Descrição da figura <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id={captionFieldId}
                            value={figureCaption}
                            onChange={(e) => {
                                setFigureCaption(e.target.value);
                                if (!hasUnsavedChanges) setHasUnsavedChanges(true);
                            }}
                            placeholder="Ex.: Acesso túnel — 01 e 02"
                            className="h-9 text-sm"
                            autoComplete="off"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Aparece na Lista de figuras do compositor (obrigatório no Escopo).
                        </p>
                    </div>
                ) : null}

                <div
                    className={`flex-1 min-h-0 relative overflow-hidden transition-colors ${
                        isDragOver ? "bg-primary/10 border-2 border-dashed border-primary" : "bg-muted/10"
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    {showUploadPrompt ? (
                        /* ── Prompt de seleção de arquivo ── */
                        <div className="h-full w-full flex flex-col items-center justify-center text-center p-12">
                            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                                <Upload className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium mb-2">Selecione uma foto</h3>
                            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                                {isDragOver
                                    ? "Solte a imagem aqui!"
                                    : "Arraste e solte, cole com Ctrl+V, ou clique para escolher."}
                            </p>
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={handleFileSelect}
                                className="hidden"
                                id={fileInputId}
                                ref={fileInputRef}
                            />
                            <Button size="lg" type="button" onClick={() => fileInputRef.current?.click()}>
                                Escolher Arquivo
                            </Button>
                        </div>
                    ) : (
                        /* ── Anotador ── */
                        <div className="h-full w-full overflow-hidden p-2 sm:p-3">
                            <AdvancedImageAnnotator
                                key={annotatorKey}
                                imageUrl={activeImageUrl!}
                                initialAnnotations={sessionAnnotations}
                                initialViewport={initialEditorViewport}
                                onSave={handleSave}
                                availableItems={availableItems}
                                sectionId={sectionId}
                                budgetId={budgetId}
                                onProductAddedToBudget={onRefresh}
                                onAnnotationsChange={handleAnnotationsChange}
                            />
                        </div>
                    )}

                    {/* Input de arquivo escondido (sem preview) */}
                    {!showUploadPrompt && !isEditMode && (
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleFileSelect}
                            className="hidden"
                            ref={fileInputRef}
                        />
                    )}
                </div>

                {/* Área de altura fixa para indicador de salvamento — evita pulo de layout ao mostrar/ocultar */}
                <div className="shrink-0 h-10 flex items-center justify-center text-sm text-muted-foreground min-h-[2.5rem]">
                    {isSaving && (
                        <span className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Fazendo upload e salvando...
                        </span>
                    )}
                </div>
            </DialogContent>
        </Dialog>

        {/* Alerta de saída com alterações não salvas */}
        <AlertDialog open={showExitAlert} onOpenChange={setShowExitAlert}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Sair sem salvar?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Você tem alterações não salvas nesta foto. Se sair agora, as alterações serão perdidas.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setShowExitAlert(false)}>Continuar editando</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleForceClose}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        Descartar alterações
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
}

"use client";

import { ToolType } from './tools/types';
import { Button } from '@/components/ui/button';
import {
    MousePointer2,
    Hash,
    ArrowRight,
    Type,
    Trash2,
    Square,
    ImagePlus,
    Spline,
    Library
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToolbarProps {
    selectedTool: ToolType;
    onToolSelect: (tool: ToolType) => void;
    onDelete?: () => void;
    canDelete?: boolean;
    onInsertImage?: () => void;
    onToggleCatalog?: () => void;
    catalogOpen?: boolean;
    isSaving?: boolean;
    onSave?: () => void;
}

const TOOLS = [
    { type: 'select' as ToolType, icon: MousePointer2, label: 'Selecionar', shortcut: 'V' },
    { type: 'step_number' as ToolType, icon: Hash, label: 'Numeração', shortcut: 'N' },
    {
        type: 'arrow' as ToolType,
        icon: ArrowRight,
        label: 'Seta',
        shortcut: 'A',
        hint: 'Clique e arraste na imagem do início ao fim',
    },
    { type: 'text' as ToolType, icon: Type, label: 'Texto', shortcut: 'T' },
    { type: 'rect' as ToolType, icon: Square, label: 'Retângulo', shortcut: 'R' },
    { type: 'polyline' as ToolType, icon: Spline, label: 'Linha', shortcut: 'L' },
];

export function Toolbar({ selectedTool, onToolSelect, onDelete, canDelete, onInsertImage, onToggleCatalog, catalogOpen, isSaving, onSave }: ToolbarProps) {
    return (
        <div className="flex items-center gap-2 p-2 bg-card border rounded-lg">
            <div className="flex items-center gap-1">
                {TOOLS.map((tool) => {
                    const Icon = tool.icon;
                    const isSelected = selectedTool === tool.type;

                    return (
                        <Button
                            key={tool.type}
                            variant={isSelected ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => onToolSelect(tool.type)}
                            className={cn(
                                "h-9 w-9 p-0",
                                isSelected && "bg-primary text-primary-foreground"
                            )}
                            title={
                                "hint" in tool && tool.hint
                                    ? `${tool.label} (${tool.shortcut}) — ${tool.hint}`
                                    : `${tool.label} (${tool.shortcut})`
                            }
                        >
                            <Icon className="h-4 w-4" />
                        </Button>
                    );
                })}
            </div>

            <div className="h-6 w-px bg-border mx-1" />

            <Button
                variant="ghost"
                size="sm"
                onClick={onInsertImage}
                className="h-9 w-9 p-0"
                title="Inserir Imagem"
            >
                <ImagePlus className="h-4 w-4" />
            </Button>

            {onToggleCatalog != null && (
                <Button
                    variant={catalogOpen ? 'default' : 'ghost'}
                    size="sm"
                    onClick={onToggleCatalog}
                    className="h-9 w-9 p-0"
                    title={catalogOpen ? 'Ocultar itens e grupos' : 'Mostrar itens e grupos'}
                >
                    <Library className="h-4 w-4" />
                </Button>
            )}

            <div className="h-6 w-px bg-border mx-1" />

            <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                disabled={!canDelete}
                className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                title="Deletar (Delete)"
            >
                <Trash2 className="h-4 w-4" />
            </Button>

            <div className="ml-auto text-xs text-muted-foreground">
                {selectedTool === 'select' && 'Clique para selecionar anotações'}
                {selectedTool === 'step_number' && 'Clique na imagem para adicionar número'}
                {selectedTool === 'arrow' && 'Arraste para desenhar seta'}
                {selectedTool === 'text' && 'Clique para adicionar texto'}
                {selectedTool === 'rect' && 'Arraste para desenhar retângulo'}
                {selectedTool === 'polyline' && 'Clique para adicionar pontos · Duplo-clique para finalizar · Esc para cancelar'}
            </div>

            {onSave && (
                <div className="ml-2 flex items-center">
                    <Button
                        size="sm"
                        onClick={onSave}
                        disabled={isSaving}
                        variant="default"
                    >
                        {isSaving ? (
                            <span className="flex items-center gap-2">
                                <span className="w-4 h-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                                Salvando
                            </span>
                        ) : (
                            <span>Salvar e Fechar</span>
                        )}
                    </Button>
                </div>
            )}
        </div>
    );
}

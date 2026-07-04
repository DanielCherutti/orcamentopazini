"use client";

import { Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DatabookTemplateArea } from "@/types/databook-template-types";

interface DatabookAreasEditorProps {
    areas: DatabookTemplateArea[];
    onChange: (areas: DatabookTemplateArea[]) => void;
}

export function DatabookAreasEditor({ areas, onChange }: DatabookAreasEditorProps) {
    const updateArea = (index: number, patch: Partial<DatabookTemplateArea>) => {
        const next = areas.map((a, i) => (i === index ? { ...a, ...patch } : a));
        onChange(next);
    };

    const addArea = () => {
        const n = areas.length + 1;
        onChange([
            ...areas,
            {
                code: `AD-${String(n).padStart(2, "0")}`,
                title: "Nova área",
                checklist: [{ text: "Item do checklist" }],
            },
        ]);
    };

    const removeArea = (index: number) => {
        if (areas.length <= 1) return;
        onChange(areas.filter((_, i) => i !== index));
    };

    const setChecklistText = (areaIndex: number, text: string) => {
        const lines = text
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
        updateArea(areaIndex, {
            checklist: lines.map((line) => ({ text: line })),
        });
    };

    return (
        <div className="space-y-4">
            {areas.map((area, index) => (
                <div key={index} className="rounded-lg border p-4 space-y-3 bg-card">
                    <div className="flex items-start gap-2">
                        <GripVertical className="h-5 w-5 text-muted-foreground mt-2 shrink-0 opacity-40" />
                        <div className="flex-1 grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                                <Label className="text-xs">Código</Label>
                                <Input
                                    value={area.code}
                                    onChange={(e) => updateArea(index, { code: e.target.value })}
                                    placeholder="AD-01"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Título da área</Label>
                                <Input
                                    value={area.title}
                                    onChange={(e) => updateArea(index, { title: e.target.value })}
                                />
                            </div>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={areas.length <= 1}
                            onClick={() => removeArea(index)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">
                            Checklist (um item por linha)
                        </Label>
                        <Textarea
                            rows={Math.max(3, area.checklist.length)}
                            value={area.checklist.map((c) => c.text).join("\n")}
                            onChange={(e) => setChecklistText(index, e.target.value)}
                            placeholder="Instalação de rodapé..."
                        />
                    </div>
                </div>
            ))}
            <Button type="button" variant="outline" onClick={addArea}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar área
            </Button>
        </div>
    );
}

"use client";

import type { Dispatch, SetStateAction } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { ToolType } from "./tools/types";
import { ANNOTATION_COLORS } from "./tools/types";
import type { BudgetItem } from "@/types/budget-types";

export interface AnnotatorEditAnnotationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dialogTitle: string;
    dialogDescription: string;
    editToolType: ToolType | null;
    editText: string;
    setEditText: Dispatch<SetStateAction<string>>;
    editFontSize: number;
    setEditFontSize: Dispatch<SetStateAction<number>>;
    editFontColor: string;
    setEditFontColor: Dispatch<SetStateAction<string>>;
    editStrokeColor: string;
    setEditStrokeColor: Dispatch<SetStateAction<string>>;
    editTextStrokeWidth: number;
    setEditTextStrokeWidth: Dispatch<SetStateAction<number>>;
    editBorderColor: string;
    setEditBorderColor: Dispatch<SetStateAction<string>>;
    editPolylineStrokeWidth: number;
    setEditPolylineStrokeWidth: Dispatch<SetStateAction<number>>;
    editPolylineLineStyle: "solid" | "dashed" | "dotted";
    setEditPolylineLineStyle: Dispatch<SetStateAction<"solid" | "dashed" | "dotted">>;
    availableItems: BudgetItem[];
    editLinkedItemId: string | null;
    setEditLinkedItemId: Dispatch<SetStateAction<string | null>>;
    onSave: () => void;
}

export function AnnotatorEditAnnotationDialog(props: AnnotatorEditAnnotationDialogProps) {
    const {
        open,
        onOpenChange,
        dialogTitle,
        dialogDescription,
        editToolType,
        editText,
        setEditText,
        editFontSize,
        setEditFontSize,
        editFontColor,
        setEditFontColor,
        editStrokeColor,
        setEditStrokeColor,
        editTextStrokeWidth,
        setEditTextStrokeWidth,
        editBorderColor,
        setEditBorderColor,
        editPolylineStrokeWidth,
        setEditPolylineStrokeWidth,
        editPolylineLineStyle,
        setEditPolylineLineStyle,
        availableItems,
        editLinkedItemId,
        setEditLinkedItemId,
        onSave,
    } = props;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{dialogTitle}</DialogTitle>
                    <DialogDescription>{dialogDescription}</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-4">
                    {editToolType === "text" && (
                        <>
                            <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} />
                            <div>
                                <Label className="text-sm mb-1.5 block">
                                    Tamanho da fonte ({editFontSize}px)
                                </Label>
                                <input
                                    type="range"
                                    min={10}
                                    max={48}
                                    step={1}
                                    value={editFontSize}
                                    onChange={(e) => setEditFontSize(Number(e.target.value))}
                                    className="w-full"
                                />
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <Label className="text-sm mb-1.5 block">Cor do texto</Label>
                                    <div className="flex gap-2 flex-wrap">
                                        {Object.entries(ANNOTATION_COLORS).map(([name, color]) => (
                                            <button
                                                key={name}
                                                type="button"
                                                className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                                                style={{
                                                    backgroundColor: color,
                                                    borderColor: editFontColor === color ? "#0EA5E9" : "#d1d5db",
                                                    transform: editFontColor === color ? "scale(1.15)" : undefined,
                                                }}
                                                onClick={() => setEditFontColor(color)}
                                                title={name}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-sm mb-1.5 block">Contorno do texto</Label>
                                    <div className="flex gap-2 flex-wrap">
                                        <button
                                            type="button"
                                            className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center text-xs text-muted-foreground"
                                            style={{
                                                borderColor: !editStrokeColor ? "#0EA5E9" : "#d1d5db",
                                                transform: !editStrokeColor ? "scale(1.15)" : undefined,
                                            }}
                                            onClick={() => {
                                                setEditStrokeColor("");
                                                setEditTextStrokeWidth(0);
                                            }}
                                            title="Sem contorno"
                                        >
                                            &#x2205;
                                        </button>
                                        {Object.entries(ANNOTATION_COLORS).map(([name, color]) => (
                                            <button
                                                key={name}
                                                type="button"
                                                className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                                                style={{
                                                    backgroundColor: color,
                                                    borderColor: editStrokeColor === color ? "#0EA5E9" : "#d1d5db",
                                                    transform: editStrokeColor === color ? "scale(1.15)" : undefined,
                                                }}
                                                onClick={() => {
                                                    setEditStrokeColor(color);
                                                    if (!editTextStrokeWidth) setEditTextStrokeWidth(1);
                                                }}
                                                title={name}
                                            />
                                        ))}
                                    </div>
                                </div>
                                {editStrokeColor && (
                                    <div>
                                        <Label className="text-sm mb-1.5 block">
                                            Espessura do contorno ({editTextStrokeWidth})
                                        </Label>
                                        <input
                                            type="range"
                                            min={0}
                                            max={5}
                                            step={0.5}
                                            value={editTextStrokeWidth}
                                            onChange={(e) => setEditTextStrokeWidth(Number(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>
                                )}
                                <div>
                                    <Label className="text-sm mb-1.5 block">Borda do box</Label>
                                    <div className="flex gap-2 flex-wrap">
                                        <button
                                            type="button"
                                            className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center text-xs text-muted-foreground"
                                            style={{
                                                borderColor: !editBorderColor ? "#0EA5E9" : "#d1d5db",
                                                transform: !editBorderColor ? "scale(1.15)" : undefined,
                                            }}
                                            onClick={() => setEditBorderColor("")}
                                            title="Sem borda"
                                        >
                                            &#x2205;
                                        </button>
                                        {Object.entries(ANNOTATION_COLORS).map(([name, color]) => (
                                            <button
                                                key={name}
                                                type="button"
                                                className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                                                style={{
                                                    backgroundColor: color,
                                                    borderColor: editBorderColor === color ? "#0EA5E9" : "#d1d5db",
                                                    transform: editBorderColor === color ? "scale(1.15)" : undefined,
                                                }}
                                                onClick={() => setEditBorderColor(color)}
                                                title={name}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                    {editToolType === "polyline" && (
                        <div className="space-y-4">
                            <div>
                                <Label className="text-sm mb-1.5 block">Cor da linha</Label>
                                <div className="flex gap-2 flex-wrap">
                                    {Object.entries(ANNOTATION_COLORS).map(([name, color]) => (
                                        <button
                                            key={name}
                                            type="button"
                                            className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                                            style={{
                                                backgroundColor: color,
                                                borderColor: editFontColor === color ? "#0EA5E9" : "#d1d5db",
                                                transform: editFontColor === color ? "scale(1.15)" : undefined,
                                            }}
                                            onClick={() => setEditFontColor(color)}
                                            title={name}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div>
                                <Label className="text-sm mb-1.5 block">
                                    Espessura ({editPolylineStrokeWidth}px)
                                </Label>
                                <input
                                    type="range"
                                    min={1}
                                    max={10}
                                    step={1}
                                    value={editPolylineStrokeWidth}
                                    onChange={(e) => setEditPolylineStrokeWidth(Number(e.target.value))}
                                    className="w-full"
                                />
                            </div>
                            <div>
                                <Label className="text-sm mb-1.5 block">Estilo</Label>
                                <div className="flex gap-2">
                                    {(["solid", "dashed", "dotted"] as const).map((s) => (
                                        <button
                                            key={s}
                                            type="button"
                                            className="px-3 py-1.5 rounded border text-xs transition-colors"
                                            style={{
                                                borderColor: editPolylineLineStyle === s ? "#0EA5E9" : "#d1d5db",
                                                backgroundColor:
                                                    editPolylineLineStyle === s ? "#EFF6FF" : undefined,
                                                color: editPolylineLineStyle === s ? "#0EA5E9" : undefined,
                                            }}
                                            onClick={() => setEditPolylineLineStyle(s)}
                                        >
                                            {s === "solid" ? "Sólido" : s === "dashed" ? "Tracejado" : "Pontilhado"}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                    {availableItems.length > 0 &&
                        editToolType !== "text" &&
                        editToolType !== "polyline" && (
                            <Select
                                value={editLinkedItemId || undefined}
                                onValueChange={setEditLinkedItemId}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none_selection_special_id">Nenhum</SelectItem>
                                    {availableItems.map((item) => (
                                        <SelectItem key={item.id} value={item.id!}>
                                            {(typeof item.product_id === "object"
                                                ? (item.product_id as Record<string, string>).description
                                                : null) || "Item"}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                </div>
                <DialogFooter>
                    <Button type="button" onClick={onSave}>
                        Salvar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

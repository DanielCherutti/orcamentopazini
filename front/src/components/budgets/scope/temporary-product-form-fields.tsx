"use client";

import { useEffect, useState } from "react";
import { ImageUpload } from "@/components/products/image-upload";
import { ProductUnitSelector } from "@/components/products/product-unit-selector";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
    generateTemporaryProductCode,
    type TemporaryProductInput,
} from "@/lib/products/temporary-product";
import { normalizeNcm } from "@/lib/products/ncm";

const formatPrice = (value: number) =>
    new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(value);

const parsePriceValue = (formatted: string) => {
    if (!formatted) return 0;
    const clean = formatted.replace(/\./g, "").replace(",", ".");
    return parseFloat(clean) || 0;
};

export type TemporaryProductFormValues = TemporaryProductInput;

type Props = {
    values: TemporaryProductFormValues;
    onChange: (values: TemporaryProductFormValues) => void;
    errors?: Record<string, string | undefined>;
    disabled?: boolean;
};

export function createEmptyTemporaryProductValues(): TemporaryProductFormValues {
    return {
        code: generateTemporaryProductCode(),
        ncm: "",
        description: "",
        unit: "",
        equipmentPrice: 0,
        assemblyPrice: 0,
        assemblyPriceType: "fixed",
        assemblyPricePercentage: null,
        detailedDescription: "",
        imageUrl: "",
    };
}

export function TemporaryProductFormFields({ values, onChange, errors, disabled }: Props) {
    const [equipPrice, setEquipPrice] = useState(
        values.equipmentPrice > 0 ? formatPrice(values.equipmentPrice) : "",
    );
    const [assemblyPrice, setAssemblyPrice] = useState(
        values.assemblyPrice > 0 ? formatPrice(values.assemblyPrice) : "",
    );

    useEffect(() => {
        setEquipPrice(values.equipmentPrice > 0 ? formatPrice(values.equipmentPrice) : "");
        setAssemblyPrice(values.assemblyPrice > 0 ? formatPrice(values.assemblyPrice) : "");
    }, [values.equipmentPrice, values.assemblyPrice]);

    const patch = (partial: Partial<TemporaryProductFormValues>) => {
        onChange({ ...values, ...partial });
    };

    const handlePriceChange = (raw: string, setter: (v: string) => void, field: "equipmentPrice" | "assemblyPrice") => {
        const digits = raw.replace(/\D/g, "");
        const numberValue = Number(digits) / 100;
        setter(formatPrice(numberValue));
        patch({ [field]: numberValue });
    };

    const equipPriceNumber = parsePriceValue(equipPrice);
    const percentageNumber = values.assemblyPricePercentage ?? 0;
    const calculatedAssemblyPrice =
        values.assemblyPriceType === "percentage"
            ? (equipPriceNumber * percentageNumber) / 100
            : parsePriceValue(assemblyPrice);

    return (
        <div className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
                Produto usado só neste orçamento — não entra no catálogo geral.
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                    <Label htmlFor="temp-product-code">Código</Label>
                    <Input
                        id="temp-product-code"
                        value={values.code ?? ""}
                        onChange={(e) => patch({ code: e.target.value })}
                        disabled={disabled}
                        placeholder="TMP-…"
                    />
                    {errors?.code && <p className="text-xs text-destructive">{errors.code}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="temp-product-ncm">NCM *</Label>
                    <Input
                        id="temp-product-ncm"
                        value={values.ncm}
                        onChange={(e) => patch({ ncm: normalizeNcm(e.target.value) })}
                        inputMode="numeric"
                        maxLength={8}
                        placeholder="00000000"
                        disabled={disabled}
                    />
                    {errors?.ncm && <p className="text-xs text-destructive">{errors.ncm}</p>}
                </div>
                <div className="space-y-2">
                    <Label>Unidade *</Label>
                    <ProductUnitSelector
                        value={values.unit}
                        onChange={(unit) => patch({ unit })}
                        disabled={disabled}
                    />
                    {errors?.unit && <p className="text-xs text-destructive">{errors.unit}</p>}
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="temp-product-description">Descrição *</Label>
                <Input
                    id="temp-product-description"
                    value={values.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    disabled={disabled}
                    placeholder="Nome do produto"
                />
                {errors?.description && (
                    <p className="text-xs text-destructive">{errors.description}</p>
                )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="temp-product-equip">Preço equipamento (R$) *</Label>
                    <Input
                        id="temp-product-equip"
                        type="text"
                        value={equipPrice}
                        onChange={(e) => handlePriceChange(e.target.value, setEquipPrice, "equipmentPrice")}
                        disabled={disabled}
                        placeholder="0,00"
                    />
                    {errors?.equipmentPrice && (
                        <p className="text-xs text-destructive">{errors.equipmentPrice}</p>
                    )}
                </div>
                <div className="space-y-2">
                    <Label>Preço montagem</Label>
                    <div className="flex gap-2">
                        <Select
                            value={values.assemblyPriceType}
                            onValueChange={(v: "fixed" | "percentage") =>
                                patch({ assemblyPriceType: v })
                            }
                            disabled={disabled}
                        >
                            <SelectTrigger className="w-[100px] shrink-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="fixed">R$</SelectItem>
                                <SelectItem value="percentage">%</SelectItem>
                            </SelectContent>
                        </Select>
                        {values.assemblyPriceType === "fixed" ? (
                            <Input
                                type="text"
                                value={assemblyPrice}
                                onChange={(e) =>
                                    handlePriceChange(e.target.value, setAssemblyPrice, "assemblyPrice")
                                }
                                disabled={disabled}
                                placeholder="0,00"
                            />
                        ) : (
                            <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                value={values.assemblyPricePercentage ?? ""}
                                onChange={(e) =>
                                    patch({
                                        assemblyPricePercentage: e.target.value
                                            ? Number(e.target.value)
                                            : null,
                                    })
                                }
                                disabled={disabled}
                                placeholder="0"
                            />
                        )}
                    </div>
                    {values.assemblyPriceType === "percentage" &&
                        equipPriceNumber > 0 &&
                        percentageNumber > 0 && (
                            <p className="text-xs text-muted-foreground">
                                Valor calculado: R$ {formatPrice(calculatedAssemblyPrice)}
                            </p>
                        )}
                </div>
            </div>

            <div className="space-y-2">
                <Label>Imagem (opcional)</Label>
                <div className="rounded-md border p-3">
                    <ImageUpload
                        initialUrl={values.imageUrl}
                        onImageUploaded={(url) => patch({ imageUrl: url })}
                        onImageRemoved={() => patch({ imageUrl: "" })}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label>Descrição detalhada (opcional)</Label>
                <div className="hidden sm:block">
                    <RichTextEditor
                        value={values.detailedDescription ?? ""}
                        onChange={(detailedDescription) => patch({ detailedDescription })}
                    />
                </div>
                <Textarea
                    className="sm:hidden min-h-[120px]"
                    value={values.detailedDescription ?? ""}
                    onChange={(e) => patch({ detailedDescription: e.target.value })}
                    disabled={disabled}
                    placeholder="Detalhes técnicos, observações…"
                />
            </div>
        </div>
    );
}

import type { TechnicalEquipmentCategory } from "@/types/technical-equipment-types";

export const TECHNICAL_EQUIPMENT_CATEGORIES: {
    value: TechnicalEquipmentCategory;
    label: string;
}[] = [
    { value: "linha_vida", label: "Linha de vida" },
    { value: "trava_quedas", label: "Trava-quedas" },
    { value: "conector", label: "Conector / ancorage" },
    { value: "guarda_corpo", label: "Guarda-corpo / gradil" },
    { value: "escada", label: "Escada / acesso" },
    { value: "monope", label: "Monopé de resgate" },
    { value: "plataforma", label: "Plataforma / alçapão" },
    { value: "outro", label: "Outro" },
];

export function getTechnicalEquipmentCategoryLabel(
    category: TechnicalEquipmentCategory | string,
): string {
    return (
        TECHNICAL_EQUIPMENT_CATEGORIES.find((c) => c.value === category)?.label ??
        category
    );
}

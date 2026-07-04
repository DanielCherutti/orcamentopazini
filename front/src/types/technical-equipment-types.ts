export type TechnicalEquipmentCategory =
    | "linha_vida"
    | "trava_quedas"
    | "conector"
    | "guarda_corpo"
    | "escada"
    | "monope"
    | "plataforma"
    | "outro";

export type TechnicalEquipmentFile = {
    id: string;
    filename: string;
    url: string;
    type: string;
};

export type TechnicalEquipment = {
    id?: string;
    code: string;
    manufacturer: string;
    model: string;
    description: string;
    category: TechnicalEquipmentCategory;
    norms?: string[];
    capacity_kn?: number | null;
    users_capacity?: number | null;
    imageUrl?: string;
    manual_file?: TechnicalEquipmentFile | null;
    datasheet_file?: TechnicalEquipmentFile | null;
    certificate_file?: TechnicalEquipmentFile | null;
    notes?: string;
    active: boolean;
    created_at?: string;
    updated_at?: string;
};

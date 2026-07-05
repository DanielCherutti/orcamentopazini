export type DeliveryProjectStatus =
    | "planning"
    | "installing"
    | "documentation"
    | "review"
    | "delivered";

export type DeliveryAreaStatus = "pending" | "in_progress" | "done";

export type DeliveryEvidenceKind =
    | "photo_before"
    | "photo_during"
    | "photo_after"
    | "document"
    | "other";

export type DeliveryChecklistItem = {
    id: string;
    text: string;
    done: boolean;
    notes?: string;
};

export type DeliveryProject = {
    id?: string;
    budget_id: string;
    client_id?: string;
    title: string;
    contract_ref?: string;
    status: DeliveryProjectStatus;
    gestor_nome?: string;
    gestor_phone?: string;
    deadline_days?: number;
    notes?: string;
    budget_code?: string;
    client_name?: string;
    databook_template_id?: string;
    databook_template_name?: string;
    created_at?: string;
    updated_at?: string;
};

export type DeliveryArea = {
    id?: string;
    delivery_project_id: string;
    code: string;
    title: string;
    description?: string;
    status: DeliveryAreaStatus;
    sort_order: number;
    checklist: DeliveryChecklistItem[];
};

export type DeliveryEvidence = {
    id?: string;
    delivery_project_id: string;
    delivery_area_id?: string;
    kind: DeliveryEvidenceKind;
    filename: string;
    url: string;
    type: string;
    caption?: string;
    created_at?: string;
};

export type DeliveryInstallation = {
    id?: string;
    delivery_project_id: string;
    delivery_area_id: string;
    technical_equipment_id: string;
    quantity: number;
    tag?: string;
    serial_number?: string;
    notes?: string;
    include_manual_in_export: boolean;
    equipment_code?: string;
    equipment_description?: string;
    equipment_manufacturer?: string;
    equipment_model?: string;
};

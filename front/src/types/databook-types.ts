export const DATABOOK_STATUSES = [
    "draft",
    "in_review",
    "approved",
    "archived",
] as const;

export type DatabookStatus = (typeof DATABOOK_STATUSES)[number];

export const DOCUMENT_GENERATION_STATUSES = [
    "queued",
    "preparing",
    "rendering_content",
    "rendering_installations",
    "processing_images",
    "merging_manuals",
    "building_indexes",
    "finalizing",
    "completed",
    "failed",
    "cancelled",
] as const;

export type DocumentGenerationStatus = (typeof DOCUMENT_GENERATION_STATUSES)[number];
export type EstimateConfidence = "low" | "medium" | "high";
export type ManualAuthorship = "internal" | "external";
export type AttachmentKind = "annex" | "appendix";

export type Databook = {
    id: string;
    client_id: string;
    template_id?: string | null;
    code: string;
    title: string;
    description?: string;
    project_name?: string;
    worksite_name?: string;
    location?: string;
    art_number?: string;
    revision?: string;
    issue_date?: string;
    inspection_date?: string;
    validity?: string;
    technical_responsible?: string;
    installer_responsible?: string;
    inspector?: string;
    internal_notes?: string;
    status: DatabookStatus;
    current_version: number;
    pdf_outdated: boolean;
    installation_count?: number;
    created_by?: string;
    updated_by?: string;
    created_at?: string;
    updated_at?: string;
};

export type DatabookInstallation = {
    id: string;
    databook_id: string;
    name: string;
    code?: string;
    location_identification?: string;
    description?: string;
    installer_name?: string;
    inspection_date?: string;
    validity?: string;
    inspector_name?: string;
    general_observations?: string;
    position: number;
    products: DatabookInstallationProduct[];
};

export type DatabookInstallationProduct = {
    id: string;
    databook_installation_id: string;
    product_id: string;
    product_code?: string;
    title: string;
    quantity: number;
    unit?: string;
    suffix?: string;
    position: number;
    table_schema_snapshot: TechnicalTableSchema;
    table_values: Record<string, string | number | boolean | null>;
    product_snapshot: Record<string, unknown>;
    manual_reference_snapshot?: Record<string, unknown> | null;
    structural_evaluation?: string;
    general_observations?: string;
};

export type DatabookMedia = {
    id: string;
    databook_id: string;
    installation_id?: string;
    installation_product_id?: string;
    file_url: string;
    filename: string;
    mime_type: string;
    caption?: string;
    alt_text?: string;
    category?: string;
    include_in_figure_list: boolean;
    position: number;
    embedded_src?: string;
};

export type TechnicalCellKind =
    | "label"
    | "value"
    | "fixed"
    | "variable"
    | "input"
    | "long_text"
    | "select"
    | "boolean"
    | "date";

export type TechnicalTableCell = {
    id: string;
    row: number;
    column: number;
    rowSpan?: number;
    columnSpan?: number;
    kind: TechnicalCellKind;
    key?: string;
    label?: string;
    defaultValue?: string | number | boolean | null;
    variable?: string;
    required?: boolean;
    placeholder?: string;
    options?: string[];
    style?: {
        align?: "left" | "center" | "right";
        bold?: boolean;
        italic?: boolean;
        background?: string;
        borderColor?: string;
    };
};

export type TechnicalTableSchema = {
    version: 1;
    rows: number;
    columns: Array<{ id: string; width?: number }>;
    cells: TechnicalTableCell[];
    tableWidthPercent?: number;
    hideEmptyCells?: boolean;
};

export type ProductManual = {
    id: string;
    product_id: string;
    title: string;
    description?: string;
    file_url: string;
    filename: string;
    mime_type: "application/pdf";
    authorship: ManualAuthorship;
    manufacturer?: string;
    edition?: string;
    document_date?: string;
    code?: string;
    language?: string;
    active: boolean;
    checksum?: string;
    page_count?: number;
    created_at?: string;
    updated_at?: string;
};

export type DocumentGenerationProgress = {
    status: DocumentGenerationStatus;
    phaseLabel: string;
    progress: number;
    processedItems: number;
    totalItems: number;
    elapsedSeconds: number;
    estimatedRemainingSeconds: number | null;
    estimateConfidence: EstimateConfidence;
    message: string;
};

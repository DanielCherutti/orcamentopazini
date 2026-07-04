export type DatabookTemplateChecklistItem = {
    text: string;
};

export type DatabookTemplateArea = {
    code: string;
    title: string;
    description?: string;
    checklist: DatabookTemplateChecklistItem[];
};

export type DatabookTemplateFile = {
    id: string;
    filename: string;
    url: string;
    type: string;
};

export type DatabookTemplate = {
    id?: string;
    name: string;
    description?: string;
    client_label?: string;
    default_deadline_days?: number;
    areas: DatabookTemplateArea[];
    reference_file?: DatabookTemplateFile | null;
    is_default?: boolean;
    active: boolean;
    created_at?: string;
    updated_at?: string;
};

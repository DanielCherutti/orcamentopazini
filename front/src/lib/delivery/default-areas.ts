import { BUILTIN_DATABOOK_CVALE_AREAS } from "@/lib/delivery/built-in-databook-cvale";
import type { DeliveryChecklistItem } from "@/types/delivery-types";

export type DefaultDeliveryAreaTemplate = {
    code: string;
    title: string;
    description?: string;
    checklist: Omit<DeliveryChecklistItem, "id">[];
};

/** @deprecated Use databook_template no cadastro. Mantido para compatibilidade interna. */
export const DEFAULT_DELIVERY_AREAS: DefaultDeliveryAreaTemplate[] =
    BUILTIN_DATABOOK_CVALE_AREAS.map((area) => ({
        code: area.code,
        title: area.title,
        description: area.description,
        checklist: area.checklist.map((c) => ({ text: c.text, done: false })),
    }));

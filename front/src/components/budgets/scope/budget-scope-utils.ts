export const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

export const NO_GROUP_VALUE = "__none__";

export {
    buildItemSegments,
    getBudgetItemGroupSegmentKey,
    type ItemSegment,
} from "@/lib/budgets/item-group-segment";

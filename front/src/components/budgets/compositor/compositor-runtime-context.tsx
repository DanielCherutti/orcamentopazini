"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
    addBlockAction,
    deleteBlockAction,
    moveBlockToParentAction,
    reorderBlocksAction,
    updateBlockAction,
} from "@/actions/budget-compositor-block-actions";
import {
    addDeliveryBlockAction,
    deleteDeliveryBlockAction,
    moveDeliveryBlockToParentAction,
    reorderDeliveryBlocksAction,
    updateDeliveryBlockAction,
} from "@/actions/delivery-compositor-block-actions";

export type CompositorKind = "budget" | "delivery";

export type CompositorRuntimeActions = {
    updateBlockAction: typeof updateBlockAction;
    addBlockAction: (params: {
        budgetId: string;
        parentId: string | null;
        type: string;
        label: string;
        props?: Record<string, unknown>;
    }) => ReturnType<typeof addBlockAction>;
    deleteBlockAction: typeof deleteBlockAction;
    reorderBlocksAction: typeof reorderBlocksAction;
    moveBlockToParentAction: typeof moveBlockToParentAction;
};

const budgetActions: CompositorRuntimeActions = {
    updateBlockAction,
    addBlockAction,
    deleteBlockAction,
    reorderBlocksAction,
    moveBlockToParentAction,
};

const deliveryActions: CompositorRuntimeActions = {
    updateBlockAction: (blockId, budgetId, patch) =>
        updateDeliveryBlockAction(blockId, budgetId, patch),
    addBlockAction: (params) =>
        addDeliveryBlockAction({
            projectId: params.budgetId,
            parentId: params.parentId,
            type: params.type,
            label: params.label,
            props: params.props,
        }),
    deleteBlockAction: (blockId, budgetId) => deleteDeliveryBlockAction(blockId, budgetId),
    reorderBlocksAction: (orderedBlockIds, budgetId) =>
        reorderDeliveryBlocksAction(budgetId, orderedBlockIds),
    moveBlockToParentAction: (blockId, newParentId, budgetId) =>
        moveDeliveryBlockToParentAction(blockId, newParentId, budgetId),
};

const CompositorRuntimeContext = createContext<{
    kind: CompositorKind;
    actions: CompositorRuntimeActions;
} | null>(null);

export function CompositorRuntimeProvider({
    kind,
    children,
}: {
    kind: CompositorKind;
    children: ReactNode;
}) {
    const actions = kind === "delivery" ? deliveryActions : budgetActions;
    return (
        <CompositorRuntimeContext.Provider value={{ kind, actions }}>
            {children}
        </CompositorRuntimeContext.Provider>
    );
}

export function useCompositorRuntime() {
    const ctx = useContext(CompositorRuntimeContext);
    if (!ctx) {
        return { kind: "budget" as const, actions: budgetActions };
    }
    return ctx;
}

/** Blocos que não existem no DataBook de entrega técnica. */
export function isDeliveryCompositorBlockDisabled(type: string, kind: CompositorKind): boolean {
    if (kind !== "delivery") return false;
    return ["quote", "scope", "figures", "location", "section", "terms"].includes(type);
}

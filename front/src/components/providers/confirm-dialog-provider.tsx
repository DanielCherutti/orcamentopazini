"use client";

import {
    createContext,
    useCallback,
    useContext,
    useRef,
    useState,
    type ReactNode,
} from "react";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type ConfirmDialogOptions = {
    title?: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
};

type ConfirmFn = (options: ConfirmDialogOptions) => Promise<boolean>;

const ConfirmDialogContext = createContext<ConfirmFn | null>(null);

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);
    const resolveRef = useRef<((value: boolean) => void) | null>(null);

    const confirm = useCallback<ConfirmFn>((opts) => {
        return new Promise<boolean>((resolve) => {
            resolveRef.current = resolve;
            setOptions(opts);
            setOpen(true);
        });
    }, []);

    const finish = useCallback((result: boolean) => {
        setOpen(false);
        setOptions(null);
        const resolve = resolveRef.current;
        resolveRef.current = null;
        resolve?.(result);
    }, []);

    const handleOpenChange = useCallback(
        (next: boolean) => {
            if (!next) finish(false);
        },
        [finish]
    );

    return (
        <ConfirmDialogContext.Provider value={confirm}>
            {children}
            <AlertDialog open={open} onOpenChange={handleOpenChange}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{options?.title ?? "Confirmar"}</AlertDialogTitle>
                        <AlertDialogDescription>{options?.description}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => finish(false)}>
                            {options?.cancelLabel ?? "Cancelar"}
                        </AlertDialogCancel>
                        <Button
                            type="button"
                            variant={options?.destructive ? "destructive" : "default"}
                            onClick={() => finish(true)}
                        >
                            {options?.confirmLabel ?? "Confirmar"}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </ConfirmDialogContext.Provider>
    );
}

export function useConfirmDialog(): ConfirmFn {
    const ctx = useContext(ConfirmDialogContext);
    if (!ctx) {
        throw new Error("useConfirmDialog deve ser usado dentro de ConfirmDialogProvider");
    }
    return ctx;
}

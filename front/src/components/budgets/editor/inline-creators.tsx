"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { useBudgetsRepository } from "@/lib/budgets/use-budgets-repository";

// --- Location Creator ---

interface InlineLocationCreatorProps {
    budgetId: string;
    onSuccess: () => void;
    compact?: boolean;
}

export function InlineLocationCreator({ budgetId, onSuccess, compact }: InlineLocationCreatorProps) {
    const [name, setName] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const repo = useBudgetsRepository();

    const handleCreate = async () => {
        if (!name.trim()) return;
        setIsLoading(true);
        try {
            const result = await repo.addLocation(budgetId, name.trim());

            if (result.success) {
                toast.success("Local criado");
                setName("");
                onSuccess();
            } else {
                toast.error(result.error || "Erro ao criar local");
            }
        } catch {
            toast.error("Erro inesperado");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={compact ? "flex flex-col gap-2 p-2 border rounded border-dashed bg-muted/20" : "flex gap-2 items-center p-4 border rounded-md border-dashed bg-muted/20"}>
            <Input
                placeholder={compact ? "Novo ambiente..." : "Nome do novo local (ex: Cozinha, Sala)..."}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                className={compact ? "h-9 text-sm bg-background" : "bg-white"}
            />
            <Button size={compact ? "sm" : "default"} onClick={handleCreate} disabled={!name.trim() || isLoading} className={compact ? "w-full" : ""}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Adicionar Local
            </Button>
        </div>
    );
}


// --- Section Creator ---

interface InlineSectionCreatorProps {
    locationId: string;
    budgetId: string; // Necessário para a action
    onSuccess: () => void;
}

export function InlineSectionCreator({ locationId, budgetId, onSuccess }: InlineSectionCreatorProps) {
    const [name, setName] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const repo = useBudgetsRepository();

    const handleCreate = async () => {
        if (!name.trim()) return;
        setIsLoading(true);
        try {
            const result = await repo.addSection(locationId, budgetId, name.trim());

            if (result.success) {
                toast.success("Trecho criado");
                setName("");
                onSuccess();
            } else {
                toast.error(result.error || "Erro ao criar trecho");
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex gap-2 items-center mt-2 pl-4 border-l-2 border-l-muted ml-2">
            <Input
                placeholder="Novo trecho (ex: Parede Norte)..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                className="h-9 text-sm"
            />
            <Button size="sm" variant="secondary" onClick={handleCreate} disabled={!name.trim() || isLoading}>
                {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            </Button>
        </div>
    );
}

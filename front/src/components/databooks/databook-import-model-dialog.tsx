"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { listModelosAction, type Modelo, type ModeloTipo } from "@/actions/model-actions";
import { importPlatformModelToDatabookAction } from "@/actions/databook-model-actions";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

const tipos: ModeloTipo[] = ["capa", "cabecalho", "rodape", "databook_completo"];
const labels: Record<ModeloTipo, string> = {
    capa: "Capa",
    cabecalho: "Cabeçalho",
    rodape: "Rodapé",
    orcamento_completo: "Orçamento",
    databook_completo: "DataBook completo",
};

export function DatabookImportModelDialog({ databookId }: { databookId: string }) {
    const [open, setOpen] = useState(false);
    const [models, setModels] = useState<Modelo[]>([]);
    const [tipo, setTipo] = useState<ModeloTipo>("capa");
    const [selectedId, setSelectedId] = useState("");
    const [scope, setScope] = useState<"all" | "cover" | "inner">("all");
    const [loading, setLoading] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [pending, startTransition] = useTransition();
    // Radix Dialog usa IDs internos para aria-controls. Adiar sua montagem evita
    // que o servidor e o navegador gerem IDs diferentes durante a hidratação.
    const mounted = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false,
    );
    const filtered = useMemo(() => models.filter((model) => model.tipo === tipo), [models, tipo]);

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next || models.length) return;
        setLoading(true);
        void listModelosAction().then((result) => {
            const available = result.success ? result.data ?? [] : [];
            setModels(available);
            setSelectedId(available.find((model) => model.tipo === tipo)?.id ?? "");
            if (!result.success) toast.error(result.error ?? "Erro ao carregar modelos");
            setLoading(false);
        });
    };

    const apply = () => {
        if (!selectedId) return toast.error("Selecione um modelo");
        startTransition(async () => {
            const result = await importPlatformModelToDatabookAction(databookId, selectedId, scope);
            if (!result.success) {
                toast.error(result.error ?? "Erro ao importar modelo");
                return;
            }
            toast.success("Modelo aplicado ao DataBook");
            setOpen(false);
            window.location.reload();
        });
    };

    if (!mounted) {
        return <Button variant="outline" size="sm" disabled><FileDown className="mr-1.5 h-4 w-4" />Importar modelo</Button>;
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm"><FileDown className="mr-1.5 h-4 w-4" />Importar modelo</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                {confirming ? <>
                    <DialogHeader><DialogTitle className="text-destructive">Substituir estrutura atual?</DialogTitle><DialogDescription>O modelo completo de DataBook substituirá as seções e textos atuais do compositor. Capa, cabeçalho e rodapé também serão atualizados.</DialogDescription></DialogHeader>
                    <DialogFooter><Button variant="outline" disabled={pending} onClick={() => setConfirming(false)}>Cancelar</Button><Button variant="destructive" disabled={pending} onClick={apply}>{pending ? "Importando..." : "Substituir e importar"}</Button></DialogFooter>
                </> : <>
                    <DialogHeader><DialogTitle>Importar modelo da plataforma</DialogTitle><DialogDescription>Use os modelos criados na tela Modelos para aplicar uma capa, cabeçalho, rodapé ou DataBook completo.</DialogDescription></DialogHeader>
                    {loading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div> : <div className="space-y-4">
                        <div className="space-y-1.5"><Label>Tipo</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={tipo} onChange={(event) => {
                            const next = event.target.value as ModeloTipo;
                            setTipo(next);
                            setScope("all");
                            setSelectedId(models.find((model) => model.tipo === next)?.id ?? "");
                        }}>{tipos.map((item) => <option key={item} value={item}>{labels[item]}</option>)}</select></div>
                        <div className="space-y-1.5"><Label>Modelo</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{filtered.length ? filtered.map((model) => <option key={model.id} value={model.id}>{model.nome}</option>) : <option value="">Nenhum modelo deste tipo</option>}</select></div>
                        {(tipo === "cabecalho" || tipo === "rodape") ? <div className="space-y-1.5"><Label>Aplicar em</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="all">Todas as páginas</option><option value="cover">Somente capa</option><option value="inner">Somente páginas internas</option></select></div> : null}
                    </div>}
                    <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={loading || pending || !selectedId} onClick={() => tipo === "databook_completo" ? setConfirming(true) : apply()}>{pending ? "Importando..." : "Aplicar modelo"}</Button></DialogFooter>
                </>}
            </DialogContent>
        </Dialog>
    );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDatabookAction, type DatabookInput } from "@/actions/databook-actions";
import { ClientSelector } from "@/components/clients/client-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";

const initialValue: DatabookInput = { client_id: "", code: "", title: "" };

export function DatabookDocumentForm() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [value, setValue] = useState<DatabookInput>(initialValue);
    const [clientError, setClientError] = useState(false);

    const field = (name: keyof DatabookInput, next: string) =>
        setValue((current) => ({ ...current, [name]: next }));

    const submit = () => {
        if (!value.client_id) {
            setClientError(true);
            toast.error("O cliente é obrigatório para criar um DataBook.");
            return;
        }
        startTransition(async () => {
            const result = await createDatabookAction(value);
            if (!result.success || !result.id) {
                toast.error(result.error ?? "Erro ao criar DataBook");
                return;
            }
            toast.success("DataBook criado");
            router.push(`/dashboard/databook-documents/${encodeURIComponent(result.id)}`);
        });
    };

    return (
        <form className="grid gap-5 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <div className="space-y-2 md:col-span-2">
                <Label>Cliente *</Label>
                <ClientSelector
                    value={value.client_id}
                    error={clientError}
                    onSelect={(client_id) => {
                        setClientError(false);
                        setValue((current) => ({ ...current, client_id }));
                    }}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="code">Código *</Label>
                <Input id="code" value={value.code} onChange={(event) => field("code", event.target.value)} required />
            </div>
            <div className="space-y-2">
                <Label htmlFor="title">Título *</Label>
                <Input id="title" value={value.title} onChange={(event) => field("title", event.target.value)} required />
            </div>
            <div className="space-y-2">
                <Label htmlFor="project">Projeto</Label>
                <Input id="project" value={value.project_name ?? ""} onChange={(event) => field("project_name", event.target.value)} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="worksite">Obra</Label>
                <Input id="worksite" value={value.worksite_name ?? ""} onChange={(event) => field("worksite_name", event.target.value)} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="art">Número da ART</Label>
                <Input id="art" value={value.art_number ?? ""} onChange={(event) => field("art_number", event.target.value)} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="revision">Revisão</Label>
                <Input id="revision" value={value.revision ?? ""} onChange={(event) => field("revision", event.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea id="description" value={value.description ?? ""} onChange={(event) => field("description", event.target.value)} />
            </div>
            <div className="flex justify-end gap-2 md:col-span-2">
                <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
                <Button type="submit" disabled={pending}>{pending ? "Criando..." : "Criar DataBook"}</Button>
            </div>
        </form>
    );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

type Job = {
    id: string;
    status: string;
    phase_label?: string;
    progress?: number;
    processed_items?: number;
    total_items?: number;
    elapsed_seconds?: number;
    estimated_remaining_seconds?: number | null;
    estimate_confidence?: string;
    message?: string;
    output_file?: string;
};

function duration(seconds: number | null | undefined) {
    if (seconds == null) return "Calculando estimativa...";
    if (seconds < 60) return `aproximadamente ${Math.max(1, seconds)} s`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `aproximadamente ${minutes} min${rest ? ` ${rest} s` : ""}`;
}

export function DocumentGenerationProgress({ documentType, documentId }: { documentType: "budget" | "databook"; documentId: string }) {
    const [job, setJob] = useState<Job | null>(null);
    const [starting, setStarting] = useState(false);
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);
    useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
    const poll = (jobId: string) => {
        if (timer.current) clearInterval(timer.current);
        const load = async () => {
            const response = await fetch(`/api/document-generations/${encodeURIComponent(jobId)}`, { cache: "no-store" });
            if (!response.ok) return;
            const next = await response.json() as Job;
            setJob(next);
            if (["completed", "failed", "cancelled"].includes(next.status) && timer.current) {
                clearInterval(timer.current);
                timer.current = null;
                if (next.status === "completed") toast.success("PDF concluído");
                if (next.status === "failed") toast.error(next.message ?? "Falha ao gerar PDF");
            }
        };
        void load();
        timer.current = setInterval(() => void load(), 1500);
    };
    const start = async () => {
        setStarting(true);
        try {
            const response = await fetch("/api/document-generations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ documentType, documentId }),
            });
            const body = await response.json() as { jobId?: string; error?: string };
            if (!response.ok || !body.jobId) return toast.error(body.error ?? "Erro ao iniciar geração");
            poll(body.jobId);
            void fetch(`/api/document-generations/${encodeURIComponent(body.jobId)}/run`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            }).catch(() => {
                // O polling continuará mostrando o estado persistido e permitirá nova tentativa.
            });
        } catch {
            toast.error("Não foi possível iniciar a geração do PDF");
        } finally {
            setStarting(false);
        }
    };
    const active = job && !["completed", "failed", "cancelled"].includes(job.status);
    return (
        <div className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="font-medium">{job?.phase_label ?? "Geração do PDF"}</p><p className="text-sm text-muted-foreground">{job?.message ?? "Gere em segundo plano e continue usando o sistema."}</p></div>
                <div className="flex gap-2">
                    {job?.status === "completed" && job.output_file ? <Button asChild variant="outline"><a href={job.output_file} target="_blank" rel="noreferrer">Baixar PDF</a></Button> : null}
                    <Button type="button" disabled={starting || Boolean(active)} onClick={start}>{starting ? "Enfileirando..." : active ? "Gerando..." : job?.status === "completed" ? "Gerar nova versão" : "Gerar PDF"}</Button>
                </div>
            </div>
            {job ? <>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, job.progress ?? 0))}%` }} /></div>
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span>Progresso: {Math.round(job.progress ?? 0)}% · {job.processed_items ?? 0} de {job.total_items ?? 0}</span>
                    <span>Tempo restante: {duration(job.estimated_remaining_seconds)}</span>
                </div>
            </> : null}
        </div>
    );
}

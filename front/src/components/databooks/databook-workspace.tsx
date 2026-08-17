"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, BookOpen, Download, FileText, Settings2, Wrench } from "lucide-react";
import type { Databook, DatabookInstallation, DatabookMedia } from "@/types/databook-types";
import { DatabookInstallationsEditor } from "@/components/databooks/databook-installations-editor";
import { DeliveryCompositor } from "@/components/delivery/delivery-compositor";
import { DocumentGenerationProgress } from "@/components/documents/document-generation-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatabookImportModelDialog } from "@/components/databooks/databook-import-model-dialog";

type WorkspaceTab = "compositor" | "installations" | "data" | "print";

export function DatabookWorkspace({ document, installations, media }: {
    document: Databook;
    installations: DatabookInstallation[];
    media: DatabookMedia[];
}) {
    const [tab, setTab] = useState<WorkspaceTab>("compositor");
    const tabs: Array<{ id: WorkspaceTab; label: string; icon: typeof BookOpen }> = [
        { id: "compositor", label: "Compositor", icon: BookOpen },
        { id: "installations", label: "Instalações", icon: Wrench },
        { id: "data", label: "Dados", icon: Settings2 },
        { id: "print", label: "Impressão", icon: FileText },
    ];
    return (
        <div className="fixed inset-x-0 bottom-0 top-[var(--support-banner-height,0px)] z-40 flex min-h-0 flex-col bg-background">
            <header className="flex h-11 shrink-0 items-center border-b bg-background px-2">
                <div className="flex min-w-0 items-center gap-2">
                    <Button variant="ghost" size="sm" asChild><Link href="/dashboard/databook-documents"><ArrowLeft className="mr-1 h-4 w-4" />DataBooks</Link></Button>
                    <span className="text-muted-foreground">/</span>
                    <span className="font-mono text-xs">{document.code}</span>
                    <span className="text-muted-foreground">/</span>
                    <strong className="max-w-[260px] truncate text-sm">{document.title}</strong>
                    <Badge className="hidden sm:inline-flex" variant="secondary">{document.status === "draft" ? "RASCUNHO" : document.status.toUpperCase()}</Badge>
                </div>
                <nav className="mx-auto hidden h-full items-stretch md:flex">
                    {tabs.map(({ id, label, icon: Icon }) => (
                        <button key={id} type="button" onClick={() => setTab(id)} className={`flex items-center gap-1.5 border-b-2 px-4 text-sm transition-colors ${tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Icon className="h-4 w-4" />{label}</button>
                    ))}
                </nav>
                <div className="ml-auto flex items-center gap-1">
                    <DatabookImportModelDialog databookId={document.id} />
                    <Button variant="outline" size="sm" asChild><a href={`/api/databooks/${encodeURIComponent(document.id)}/pdf`} target="_blank" rel="noreferrer"><Download className="mr-1.5 h-4 w-4" />Exportar</a></Button>
                    <Button variant="outline" size="sm" onClick={() => setTab("print")}><FileText className="mr-1.5 h-4 w-4" />Preview</Button>
                </div>
            </header>
            <div className="flex shrink-0 overflow-x-auto border-b bg-background md:hidden">
                {tabs.map(({ id, label }) => <button type="button" key={id} onClick={() => setTab(id)} className={`px-4 py-2 text-sm ${tab === id ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>{label}</button>)}
            </div>
            <main className="min-h-0 flex-1 overflow-hidden bg-muted/30">
                {tab === "compositor" ? <div className="h-full min-h-0 overflow-hidden p-2"><DeliveryCompositor projectId={document.id} documentTitle={document.title} /></div> : null}
                {tab === "installations" ? <div className="h-full overflow-y-auto p-4 md:p-6"><div className="mx-auto max-w-6xl"><DatabookInstallationsEditor databookId={document.id} initialInstallations={installations} initialMedia={media} /></div></div> : null}
                {tab === "data" ? <div className="h-full overflow-y-auto p-4 md:p-6"><div className="mx-auto max-w-5xl rounded-xl border bg-card p-6"><h1 className="mb-6 text-xl font-semibold">Dados do DataBook</h1><dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><Info label="Código" value={document.code} /><Info label="Título" value={document.title} /><Info label="Projeto" value={document.project_name} /><Info label="Obra" value={document.worksite_name} /><Info label="ART" value={document.art_number} /><Info label="Revisão" value={document.revision} /><Info label="Local" value={document.location} /><Info label="Responsável técnico" value={document.technical_responsible} /><Info label="Inspetor" value={document.inspector} /></dl></div></div> : null}
                {tab === "print" ? <div className="h-full overflow-y-auto p-4 md:p-6"><div className="mx-auto max-w-5xl space-y-4"><div className="rounded-xl border bg-card p-5"><DocumentGenerationProgress documentType="databook" documentId={document.id} /></div><div className="overflow-hidden rounded-xl border bg-white"><iframe title="Preview do DataBook" src={`/api/databooks/${encodeURIComponent(document.id)}/pdf`} className="h-[75vh] min-h-[500px] w-full border-0" /></div></div></div> : null}
            </main>
        </div>
    );
}

function Info({ label, value }: { label: string; value?: string | null }) {
    return <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{value || "—"}</dd></div>;
}

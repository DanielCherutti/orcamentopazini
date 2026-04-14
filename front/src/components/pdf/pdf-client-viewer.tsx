"use client";

import { useEffect, useState } from "react";
import { budgetPdfApiUrl } from "@/lib/budgets/budget-path";

interface PdfClientViewerProps {
  budgetId: string;
}

type Phase = "loading" | "ready" | "error";

/**
 * Progresso é **estimado** no cliente (o servidor envolve um único PDF; não há eventos reais de %).
 * Sobe ~1%/intervalo até 88% e salta para 100% quando o ficheiro chega.
 */
export function PdfClientViewer({ budgetId }: PdfClientViewerProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState(0);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setPhase("loading");
    setProgress(0);
    setObjectUrl(null);
    setErrorMessage(null);

    const ac = new AbortController();
    const url = budgetPdfApiUrl(budgetId);
    const blobUrlRef: { current: string | null } = { current: null };

    const sim = setInterval(() => {
      setProgress((p) => (p >= 88 ? p : p + 1));
    }, 420);

    (async () => {
      try {
        const res = await fetch(url, { credentials: "include", signal: ac.signal });
        const ct = res.headers.get("content-type") ?? "";

        if (!res.ok) {
          let msg = `Erro ${res.status}`;
          try {
            const j = (await res.json()) as { error?: string; detail?: string };
            msg = j.detail || j.error || msg;
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }

        if (!ct.includes("application/pdf")) {
          throw new Error("A resposta não é um PDF.");
        }

        const blob = await res.blob();
        if (ac.signal.aborted) return;

        const u = URL.createObjectURL(blob);
        blobUrlRef.current = u;
        setObjectUrl(u);
        setProgress(100);
        setPhase("ready");
      } catch (e) {
        if (ac.signal.aborted) return;
        setErrorMessage(e instanceof Error ? e.message : "Falha ao carregar o PDF.");
        setPhase("error");
      } finally {
        clearInterval(sim);
      }
    })();

    return () => {
      ac.abort();
      clearInterval(sim);
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [budgetId]);

  return (
    <div className="flex h-[calc(100vh-64px)] w-full flex-col bg-slate-100">
      <div className="flex items-center justify-between bg-white p-4 shadow">
        <h1 className="text-lg font-semibold">Visualização de PDF</h1>
        {phase === "loading" ? (
          <span className="text-sm tabular-nums text-muted-foreground">{progress}%</span>
        ) : phase === "ready" ? (
          <span className="text-sm text-muted-foreground">Pronto</span>
        ) : (
          <span className="text-sm text-destructive">Erro</span>
        )}
      </div>

      {phase === "loading" ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-white p-8 shadow-inner">
          <p className="text-center text-sm text-muted-foreground">
            A gerar o PDF no servidor (imagens e layout podem demorar um pouco)…
          </p>
          <div className="w-full max-w-md">
            <div
              className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progresso estimado da geração do PDF"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Percentagem indicativa até o ficheiro estar disponível.
            </p>
          </div>
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-white p-8 text-center shadow-inner">
          <div className="max-w-lg space-y-2">
            <p className="font-medium text-destructive">Não foi possível mostrar o PDF</p>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
          </div>
        </div>
      ) : null}

      {phase === "ready" && objectUrl ? (
        <iframe
          title="Pré-visualização do PDF"
          src={objectUrl}
          className="min-h-0 w-full flex-1 border-none bg-white shadow-inner"
        />
      ) : null}
    </div>
  );
}

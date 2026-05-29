export type BudgetImportUploadResult = {
    success?: boolean;
    budgetId?: string;
    title?: string;
    error?: string;
};

export type BudgetImportUploadPhase = "upload" | "process";

export type BudgetImportUploadProgress = {
    phase: BudgetImportUploadPhase;
    /** 0–100 */
    percent: number;
};

/**
 * POST multipart para /api/budgets/import com progresso de upload (XHR).
 */
export function postBudgetImportWithProgress(
    formData: FormData,
    onProgress: (progress: BudgetImportUploadProgress) => void,
): Promise<BudgetImportUploadResult> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/budgets/import");
        xhr.withCredentials = true;

        xhr.upload.addEventListener("progress", (event) => {
            if (!event.lengthComputable) {
                onProgress({ phase: "upload", percent: 0 });
                return;
            }
            const pct = Math.min(92, Math.round((event.loaded / event.total) * 92));
            onProgress({ phase: "upload", percent: pct });
        });

        xhr.addEventListener("loadstart", () => {
            onProgress({ phase: "upload", percent: 0 });
        });

        xhr.addEventListener("load", () => {
            onProgress({ phase: "process", percent: 96 });
            let json: BudgetImportUploadResult = {};
            try {
                json = JSON.parse(xhr.responseText) as BudgetImportUploadResult;
            } catch {
                reject(new Error("Resposta inválida do servidor"));
                return;
            }

            if (xhr.status >= 200 && xhr.status < 300) {
                onProgress({ phase: "process", percent: 100 });
                resolve(json);
                return;
            }

            reject(new Error(json.error ?? "Falha na importação"));
        });

        xhr.addEventListener("error", () => {
            reject(new Error("Erro de rede ao enviar o pacote"));
        });

        xhr.addEventListener("abort", () => {
            reject(new Error("Importação cancelada"));
        });

        xhr.send(formData);
    });
}

export function formatBudgetPackageFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return "—";
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
}

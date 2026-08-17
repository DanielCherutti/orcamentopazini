import {
    LOGIN_HIGHLIGHTS_SUBTITLE,
    LOGIN_HIGHLIGHTS_TITLE,
    type LoginHighlight,
    type LoginHighlightKind,
    loginHighlights,
} from "@/data/login-highlights";
import { cn } from "@/lib/utils";

function kindLabel(kind: LoginHighlightKind | undefined): string {
    switch (kind) {
        case "feature":
            return "Novo";
        case "fix":
            return "Correção";
        case "improvement":
        default:
            return "Melhoria";
    }
}

function formatHighlightDate(iso: string | undefined): string | null {
    if (!iso) return null;
    try {
        return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
        });
    } catch {
        return null;
    }
}

function HighlightRow({ item }: { item: LoginHighlight }) {
    const dateStr = formatHighlightDate(item.date);
    const kind = item.kind ?? "improvement";

    return (
        <li className="auth-highlight-row relative py-3.5 pl-4">
            <span
                className="auth-highlight-dot absolute left-0 top-[1.35rem] h-1.5 w-1.5 rounded-full"
                aria-hidden
            />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                    className={cn(
                        "auth-highlight-kind inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        kind === "feature" && "auth-highlight-kind--feature",
                        kind === "fix" && "auth-highlight-kind--fix",
                        (kind === "improvement" || !kind) && "auth-highlight-kind--improvement",
                    )}
                >
                    {kindLabel(kind)}
                </span>
                {dateStr ? (
                    <time className="auth-highlight-date text-[10px]" dateTime={item.date}>
                        {dateStr}
                    </time>
                ) : null}
            </div>
            <p className="mt-1 text-sm font-medium leading-snug text-slate-800">{item.title}</p>
            {item.description ? (
                <p className="auth-muted mt-0.5 text-xs leading-relaxed">{item.description}</p>
            ) : null}
        </li>
    );
}

export function LoginHighlightsCard({ className }: { className?: string }) {
    if (!loginHighlights.length) return null;

    return (
        <aside className={cn("flex h-full flex-col", className)} aria-labelledby="login-highlights-heading">
            <div className="mb-4 space-y-1">
                <h2 id="login-highlights-heading" className="text-sm font-semibold text-slate-800">
                    {LOGIN_HIGHLIGHTS_TITLE}
                </h2>
                <p className="auth-muted text-xs leading-relaxed">{LOGIN_HIGHLIGHTS_SUBTITLE}</p>
            </div>

            <ul className="auth-highlight-list flex min-h-0 flex-1 flex-col divide-y overflow-y-auto pr-1 [scrollbar-gutter:stable]">
                {loginHighlights.map((item, i) => (
                    <HighlightRow key={`${item.title}-${i}`} item={item} />
                ))}
            </ul>

            <p className="auth-muted mt-4 pt-3 text-[10px] leading-relaxed">
                Dúvidas? Fale com o administrador do sistema.
            </p>
        </aside>
    );
}

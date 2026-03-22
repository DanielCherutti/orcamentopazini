import { Sparkles, Wrench, Zap } from "lucide-react";
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

function KindIcon({ kind }: { kind: LoginHighlightKind | undefined }) {
  switch (kind) {
    case "feature":
      return <Sparkles className="h-3.5 w-3.5" aria-hidden />;
    case "fix":
      return <Wrench className="h-3.5 w-3.5" aria-hidden />;
    default:
      return <Zap className="h-3.5 w-3.5" aria-hidden />;
  }
}

function formatHighlightDate(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

function HighlightRow({ item }: { item: LoginHighlight }) {
  const dateStr = formatHighlightDate(item.date);
  const kind = item.kind ?? "improvement";

  return (
    <li className="group relative rounded-xl border border-border/30 bg-gradient-to-br from-muted/12 via-background/22 to-background/12 p-3.5 shadow-sm backdrop-blur-sm transition-colors hover:border-primary/30 hover:from-muted/20 hover:via-background/32">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide backdrop-blur-sm",
            kind === "feature" &&
              "border-[color:rgb(var(--brand-secondary-rgb)/0.12)] bg-[color:rgb(var(--brand-secondary-rgb)/0.08)] text-[color:var(--brand-secondary)]",
            kind === "improvement" && "border-primary/10 bg-primary/5 text-primary",
            kind === "fix" && "border-border/30 bg-muted/40 text-muted-foreground"
          )}
        >
          <KindIcon kind={kind} />
          {kindLabel(kind)}
        </span>
        {dateStr ? (
          <time
            className="text-[10px] font-medium text-muted-foreground"
            dateTime={item.date}
          >
            {dateStr}
          </time>
        ) : null}
      </div>
      <p className="mt-2 text-sm font-semibold leading-snug text-foreground">{item.title}</p>
      {item.description ? (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
      ) : null}
    </li>
  );
}

/**
 * Card lateral (desktop) / abaixo (mobile) com novidades na página de login.
 */
export function LoginHighlightsCard({ className }: { className?: string }) {
  if (!loginHighlights.length) return null;

  return (
    <aside
      className={cn(
        "flex flex-col rounded-2xl border border-border/35 bg-card/28 p-6 shadow-[0_8px_32px_-12px_rgb(var(--primary-rgb)/0.08)] ring-1 ring-black/[0.02] backdrop-blur-xl dark:bg-card/22 dark:ring-white/[0.04]",
        className
      )}
      aria-labelledby="login-highlights-heading"
    >
      <div className="mb-4 flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/5 text-primary backdrop-blur-sm dark:bg-primary/10"
          aria-hidden
        >
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 space-y-1">
          <h2 id="login-highlights-heading" className="text-lg font-bold tracking-tight text-foreground">
            {LOGIN_HIGHLIGHTS_TITLE}
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">{LOGIN_HIGHLIGHTS_SUBTITLE}</p>
        </div>
      </div>

      <ul className="flex max-h-[min(52vh,28rem)] flex-col gap-2.5 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
        {loginHighlights.map((item, i) => (
          <HighlightRow key={`${item.title}-${i}`} item={item} />
        ))}
      </ul>

      <p className="mt-4 border-t border-border/25 pt-3 text-center text-[10px] text-muted-foreground">
        Melhorias contínuas — em caso de dúvida, fale com o administrador do sistema.
      </p>
    </aside>
  );
}

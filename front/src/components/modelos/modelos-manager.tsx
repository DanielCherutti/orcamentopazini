"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Image as ImageIcon,
  LayoutPanelTop,
  PanelBottom,
  Pencil,
  Plus,
  Search,
  Trash2,
  Calendar,
} from "lucide-react";
import {
  deleteModeloAction,
  listModelosAction,
  type Modelo,
  type ModeloTipo,
} from "@/actions/model-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirmDialog } from "@/components/providers/confirm-dialog-provider";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const tipoLabels: Record<ModeloTipo, string> = {
  cabecalho: "Cabeçalho",
  rodape: "Rodapé",
  capa: "Capa",
  orcamento_completo: "Orçamento",
};

const tipos: ModeloTipo[] = ["cabecalho", "rodape", "capa", "orcamento_completo"];

const tipoIcons = {
  cabecalho: LayoutPanelTop,
  rodape: PanelBottom,
  capa: ImageIcon,
  orcamento_completo: FileText,
} satisfies Record<ModeloTipo, typeof FileText>;

const tipoDecorations: Record<ModeloTipo, { border: string; bg: string; text: string; gradient: string }> = {
  cabecalho: {
    border: "border-blue-500/20 hover:border-blue-500/40",
    bg: "bg-blue-500/5",
    text: "text-blue-500",
    gradient: "from-blue-500/20 to-transparent",
  },
  rodape: {
    border: "border-emerald-500/20 hover:border-emerald-500/40",
    bg: "bg-emerald-500/5",
    text: "text-emerald-500",
    gradient: "from-emerald-500/20 to-transparent",
  },
  capa: {
    border: "border-amber-500/20 hover:border-amber-500/40",
    bg: "bg-amber-500/5",
    text: "text-amber-500",
    gradient: "from-amber-500/20 to-transparent",
  },
  orcamento_completo: {
    border: "border-indigo-500/20 hover:border-indigo-500/40",
    bg: "bg-indigo-500/5",
    text: "text-indigo-500",
    gradient: "from-indigo-500/20 to-transparent",
  },
};

export function ModelosManager({ initialModelos }: { initialModelos: Modelo[] }) {
  const confirm = useConfirmDialog();
  const [modelos, setModelos] = useState(initialModelos);
  const [activeTipo, setActiveTipo] = useState<ModeloTipo>("cabecalho");
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return modelos.filter(
      (modelo) =>
        modelo.tipo === activeTipo &&
        (!normalized || modelo.nome.toLocaleLowerCase("pt-BR").includes(normalized)),
    );
  }, [modelos, activeTipo, query]);

  const counts = useMemo(
    () =>
      tipos.reduce<Record<ModeloTipo, number>>(
        (acc, tipo) => ({ ...acc, [tipo]: modelos.filter((modelo) => modelo.tipo === tipo).length }),
        { cabecalho: 0, rodape: 0, capa: 0, orcamento_completo: 0 },
      ),
    [modelos],
  );

  const refresh = async () => {
    const result = await listModelosAction();
    if (result.success && result.data) setModelos(result.data);
  };

  const handleDelete = async (modelo: Modelo) => {
    const accepted = await confirm({
      title: "Excluir modelo",
      description: `Excluir “${modelo.nome}”? Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!accepted) return;
    setDeletingId(modelo.id);
    const result = await deleteModeloAction(modelo.id);
    setDeletingId(null);
    if (!result.success) {
      toast.error(result.error || "Falha ao excluir modelo.");
      return;
    }
    toast.success("Modelo excluído.");
    await refresh();
  };

  const ActiveIcon = tipoIcons[activeTipo];
  const activeDecoration = tipoDecorations[activeTipo];

  return (
    <div className="min-h-[calc(100vh-12rem)] bg-background">
      {/* Cabeçalho do Painel */}
      <header className="border-b bg-card px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Tabs
            value={activeTipo}
            onValueChange={(value) => setActiveTipo(value as ModeloTipo)}
            className="w-full md:w-auto"
          >
            <TabsList className="h-auto flex-wrap justify-start gap-2 bg-transparent p-0 border-none shadow-none">
              {tipos.map((tipo) => {
                const Icon = tipoIcons[tipo];
                const active = activeTipo === tipo;
                return (
                  <TabsTrigger
                    key={tipo}
                    value={tipo}
                    className={cn(
                      "h-9 gap-2 px-4 font-semibold text-xs tracking-wide rounded-md border transition-all cursor-pointer shadow-sm",
                      active
                        ? "!bg-primary !text-primary-foreground !border-primary"
                        : "bg-card border-muted text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tipoLabels[tipo]}
                    <span
                      className={cn(
                        "ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold transition-all",
                        active
                          ? "!bg-white/25 !text-white"
                          : "bg-muted-foreground/10 text-muted-foreground"
                      )}
                    >
                      {counts[tipo]}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>

          <Button asChild className="h-9 gap-2 shadow-sm shrink-0 font-medium">
            <Link href={`/modelos/novo?tipo=${activeTipo}`}>
              <Plus className="h-4 w-4" />
              Novo {tipoLabels[activeTipo].toLowerCase()}
            </Link>
          </Button>
        </div>
      </header>

      {/* Área de Filtros e Listagem */}
      <div className="p-4 sm:p-6 space-y-6">
        {/* Barra de Pesquisa */}
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Buscar em ${tipoLabels[activeTipo].toLowerCase()}s...`}
            className="h-10 bg-card pl-10 border-muted"
          />
        </div>

        {/* Grid de Models */}
        {filtered.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((modelo) => {
              const Icon = tipoIcons[modelo.tipo];
              const deco = tipoDecorations[modelo.tipo];
              const isDeleting = deletingId === modelo.id;
              
              // Formatar data se disponível
              const formattedDate = modelo.updated_at
                ? new Date(modelo.updated_at).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })
                : "N/A";

              return (
                <div
                  key={modelo.id}
                  className={cn(
                    "group relative flex flex-col justify-between overflow-hidden rounded-lg border bg-card p-5 shadow-sm transition-all duration-200",
                    "hover:scale-[1.01] hover:-translate-y-0.5 hover:shadow-md",
                    deco.border
                  )}
                >
                  {/* Faixa superior de gradiente decorativo */}
                  <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", deco.gradient)} />
                  
                  <div className="space-y-4">
                    {/* Header do Card */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border", deco.bg, deco.text)}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                            {modelo.nome}
                          </h3>
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mt-0.5">
                            <Calendar className="h-3 w-3" />
                            Modificado em {formattedDate}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Descrição curta de fallback */}
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {modelo.tipo === "orcamento_completo"
                        ? "Modelo de estrutura completa para geração de orçamento."
                        : `Modelo visual de ${tipoLabels[modelo.tipo].toLowerCase()} personalizado.`}
                    </p>
                  </div>

                  {/* Ações do Card */}
                  <div className="flex items-center justify-end gap-2 border-t pt-4 mt-5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-destructive hover:bg-destructive/5 hover:text-destructive gap-1.5"
                      disabled={isDeleting}
                      onClick={() => void handleDelete(modelo)}
                      title="Excluir modelo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Excluir
                    </Button>
                    <Button
                      asChild
                      size="sm"
                      variant="secondary"
                      className="h-8 gap-1.5 font-medium border"
                      title="Editar modelo"
                    >
                      <Link href={`/modelos/${modelo.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 py-16 px-4 text-center">
            <div className={cn("flex h-14 w-14 items-center justify-center rounded-full border mb-4", activeDecoration.bg, activeDecoration.text)}>
              <ActiveIcon className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              Nenhum modelo de {tipoLabels[activeTipo].toLowerCase()} encontrado
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
              {query
                ? "Nenhum resultado corresponde à sua busca de texto."
                : `Você ainda não criou nenhum modelo de ${tipoLabels[activeTipo].toLowerCase()}. Comece agora mesmo!`}
            </p>
            {!query && (
              <Button asChild className="mt-5 h-9 gap-2 shadow-sm font-medium">
                <Link href={`/modelos/novo?tipo=${activeTipo}`}>
                  <Plus className="h-4 w-4" />
                  Criar primeiro modelo
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Search, Upload } from "lucide-react";
import {
  createLibraryFontAction,
  getLibraryFontsAction,
  type LibraryFont,
} from "@/actions/font-library-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export type DocumentFontOption = {
  family: string;
  label: string;
  url?: string;
};

const BUILT_IN_FONTS: DocumentFontOption[] = [
  { family: "Arial", label: "Arial" },
  { family: "Helvetica", label: "Helvetica" },
  { family: "Times New Roman", label: "Times New Roman" },
  { family: "Courier New", label: "Courier New" },
  { family: "Georgia", label: "Georgia" },
  { family: "Verdana", label: "Verdana" },
];

function cssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function DocumentFontPicker({
  value,
  disabled,
  onChange,
}: {
  value?: string;
  disabled?: boolean;
  onChange: (font: DocumentFontOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fonts, setFonts] = useState<LibraryFont[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadFonts = async () => {
    setLoading(true);
    const result = await getLibraryFontsAction();
    if (result.success && result.data) setFonts(result.data);
    else toast.error(result.error || "Não foi possível carregar as fontes.");
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    void loadFonts();
  }, [open]);

  const options: DocumentFontOption[] = [
    ...BUILT_IN_FONTS,
    ...fonts.map((font) => ({ family: font.family, label: font.name, url: font.url })),
  ];
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const visibleOptions = options.filter((font) =>
    `${font.label} ${font.family}`.toLocaleLowerCase("pt-BR").includes(normalizedQuery),
  );
  const customCss = fonts
    .map(
      (font) =>
        `@font-face{font-family:"${cssString(font.family)}";src:url("${cssString(font.url)}");font-display:swap;}`,
    )
    .join("\n");

  const uploadFont = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/upload/font", { method: "POST", body });
      const uploaded = (await response.json()) as {
        url?: string;
        name?: string;
        format?: LibraryFont["format"];
        error?: string;
      };
      if (!response.ok || !uploaded.url || !uploaded.name || !uploaded.format) {
        toast.error(uploaded.error || "Falha ao enviar fonte.");
        return;
      }
      const fileToken = uploaded.url.split("/").pop()?.split(".")[0]?.slice(0, 8) || "fonte";
      const family = `Pazini ${uploaded.name} ${fileToken}`.slice(0, 100);
      const created = await createLibraryFontAction({
        name: uploaded.name,
        family,
        url: uploaded.url,
        format: uploaded.format,
      });
      if (!created.success || !created.data) {
        toast.error(created.error || "Falha ao salvar fonte.");
        return;
      }
      setFonts((current) => [...current, created.data!].sort((a, b) => a.name.localeCompare(b.name)));
      onChange({ family: created.data.family, label: created.data.name, url: created.data.url });
      setOpen(false);
      toast.success("Fonte importada e aplicada.");
    } catch {
      toast.error("Falha ao importar fonte.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      {customCss ? <style>{customCss}</style> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-7 w-40 justify-between rounded-sm bg-white px-2 text-[11px] font-normal"
          >
            <span className="truncate" style={{ fontFamily: value || "Arial" }}>
              {value || "Arial"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar fonte..."
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando fontes...
              </div>
            ) : (
              visibleOptions.map((font) => (
                <button
                  key={`${font.family}-${font.url ?? "builtin"}`}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-muted",
                    value === font.family && "bg-primary/10",
                  )}
                  style={{ fontFamily: font.family }}
                  onClick={() => {
                    onChange(font);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("h-4 w-4", value === font.family ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1 truncate text-base">{font.label}</span>
                  {font.url ? <span className="text-[9px] text-muted-foreground">Importada</span> : null}
                </button>
              ))
            )}
          </div>
          <div className="border-t p-2">
            <input
              ref={inputRef}
              type="file"
              accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
              className="sr-only"
              onChange={(event) => void uploadFont(event.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Importar fonte externa
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}

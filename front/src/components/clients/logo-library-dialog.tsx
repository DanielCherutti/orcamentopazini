/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, Loader2, Search } from "lucide-react";
import {
  getReusableLogosAction,
  type ReusableLogo,
} from "@/actions/image-library-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/lib/toast";

export function LogoLibraryDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (logo: ReusableLogo) => void;
}) {
  const [query, setQuery] = useState("");
  const [logos, setLogos] = useState<ReusableLogo[]>([]);
  const [loading, setLoading] = useState(false);
  const requestSequence = useRef(0);
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      requestSequence.current += 1;
      setQuery("");
      setLoading(false);
    }
    onOpenChange(nextOpen);
  };

  useEffect(() => {
    if (!open) return;
    const sequence = ++requestSequence.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const result = await getReusableLogosAction({ query, limit: 100 });
      if (sequence !== requestSequence.current) return;
      if (result.success && result.data) {
        setLogos(result.data);
      } else {
        setLogos([]);
        toast.error(result.error || "Não foi possível buscar os logotipos.");
      }
      setLoading(false);
    }, query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Buscar logotipo</DialogTitle>
          <DialogDescription>
            Selecione uma logo já usada por um cliente ou salva na biblioteca desta organização.
          </DialogDescription>
        </DialogHeader>

        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por cliente ou nome da imagem..."
            className="pl-9"
            autoFocus
          />
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {loading ? (
            <div className="flex min-h-56 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Buscando logotipos...
            </div>
          ) : logos.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <ImageIcon className="h-10 w-10 opacity-50" />
              {query ? "Nenhum logotipo encontrado." : "Ainda não há logotipos disponíveis."}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 p-1 sm:grid-cols-3 lg:grid-cols-4">
              {logos.map((logo) => (
                <Button
                  key={logo.id}
                  type="button"
                  variant="outline"
                  className="h-auto min-w-0 flex-col items-stretch gap-2 p-2 text-left"
                  onClick={() => {
                    onSelect(logo);
                    handleOpenChange(false);
                  }}
                >
                  <span className="flex h-28 items-center justify-center overflow-hidden rounded border bg-white p-2">
                    <img
                      src={logo.url}
                      alt={logo.name}
                      className="max-h-full max-w-full object-contain"
                      loading="lazy"
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">{logo.name}</span>
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      {logo.source === "customer" ? "Logo de cliente" : "Biblioteca"}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

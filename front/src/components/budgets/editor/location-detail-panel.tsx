"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { BudgetLocation, BudgetImage } from "@/types/budget-types";
import type { ImageAnnotation } from "@/components/annotator/tools/types";
import { InlineSectionCreator } from "./inline-creators";
import { SectionDetail } from "../scope/budget-scope-section-detail";
import { budgetLocationsToScopeLocations, budgetSectionToScopeSection } from "./budget-editor-scope-adapters";
import { BudgetImageGallery } from "../budget-image-gallery";
import { BudgetPhotoAnnotatorDialog } from "../budget-photo-annotator-dialog";
import { parseAnnotatorViewport } from "@/components/annotator/annotator-viewport-types";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { EditableTitle } from "./editable-title";
import { Button } from "@/components/ui/button";
import { Copy, Trash2, ChevronDown, ChevronRight, Save } from "lucide-react";
import { toast } from "@/lib/toast";
import { useBudgetsRepository } from "@/lib/budgets/use-budgets-repository";
import { useEnvironmentsExpanded } from "@/components/budgets/budget-workspace";

interface LocationDetailPanelProps {
  location: BudgetLocation | null;
  locationIndex: number; // índice 0-based na lista de locais
  budgetId: string;
  sectionNumber: number; // número raiz do orçamento (ex: 5)
  /** Quando definido, o painel mostra apenas esse trecho (comportamento “filho”). */
  selectedSectionId: string | null;
  /** Todos os ambientes do orçamento (para `SectionDetail`). */
  allLocations: BudgetLocation[];
  onRefresh: () => void;
  onDeleteLocation?: (id: string, name: string) => void;
  onDuplicateLocation?: (id: string) => void;
  /** Orçamento finalizado / fechado — só visualização. */
  isReadOnly?: boolean;
}

/**
 * Painel de configuração do local selecionado.
 * Exibe trechos, itens e cenas quando um local está selecionado.
 */
export function LocationDetailPanel({
  location,
  locationIndex,
  budgetId,
  sectionNumber,
  selectedSectionId,
  allLocations,
  onRefresh,
  onDeleteLocation,
  onDuplicateLocation,
  isReadOnly = false,
}: LocationDetailPanelProps) {
  const repo = useBudgetsRepository();
  const { environmentsExpanded } = useEnvironmentsExpanded();
  const [addPhotoOpen, setAddPhotoOpen] = useState(false);
  const [editingImage, setEditingImage] = useState<BudgetImage | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Estado local da descrição: sobrevive ao remount do RichTextEditor
  // (que acontece quando environmentsExpanded ou notesOpen alternam)
  const [currentDescription, setCurrentDescription] = useState(location?.description || "");
  const [isDirty, setIsDirty] = useState(false);
  const pendingHtmlRef = useRef<string | null>(null);

  const locationId = (location?.id as string) || "";
  const hasNotes = useMemo(() => {
    const desc = currentDescription;
    return desc !== "" && desc !== "<p></p>";
  }, [currentDescription]);

  // Sincroniza estado local quando um LOCAL diferente é selecionado
  useEffect(() => {
    setCurrentDescription(location?.description || "");
    setIsDirty(false);
    pendingHtmlRef.current = null;
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, [location?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush de segurança: cancela debounce e salva conteúdo pendente
  // quando o painel desmonta OU quando o local muda (locationId troca)
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (pendingHtmlRef.current !== null) {
        repo.updateLocation(locationId, budgetId, { description: pendingHtmlRef.current });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  const handleDescriptionChange = useCallback((html: string) => {
    setCurrentDescription(html);
    setIsDirty(true);
    pendingHtmlRef.current = html;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const res = await repo.updateLocation(locationId, budgetId, { description: html });
      if (res.success) {
        setIsDirty(false);
        pendingHtmlRef.current = null;
      } else {
        toast.error(res.error || "Erro ao salvar descrição");
      }
    }, 1500);
  }, [locationId, budgetId, repo]);

  const handleSaveDescription = useCallback(async () => {
    if (pendingHtmlRef.current === null) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const html = pendingHtmlRef.current;
    const res = await repo.updateLocation(locationId, budgetId, { description: html });
    if (res.success) {
      setIsDirty(false);
      pendingHtmlRef.current = null;
    } else {
      toast.error(res.error || "Erro ao salvar descrição");
    }
  }, [locationId, budgetId, repo]);


  const handleNameSave = useCallback(async (newName: string) => {
    const res = await repo.updateLocation(locationId, budgetId, { name: newName });
    if (res.success) {
      onRefresh();
    } else {
      toast.error(res.error || "Erro ao renomear ambiente");
    }
  }, [locationId, budgetId, repo, onRefresh]);


  const handleDeleteImage = useCallback(async (image: BudgetImage) => {
    try {
      const res = await repo.deleteBudgetImage(image.id, budgetId);
      if (res.success) {
        onRefresh();
        toast.success("Foto excluída");
      } else {
        toast.error(res.error || "Erro ao excluir foto");
      }
    } catch {
      toast.error("Erro ao excluir foto");
    }
  }, [repo, budgetId, onRefresh]);

  const scopeLocations = useMemo(
    () => budgetLocationsToScopeLocations(allLocations, budgetId),
    [allLocations, budgetId]
  );

  if (!location) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-muted/10 rounded-lg border-2 border-dashed border-muted min-h-[300px]">
        <p className="text-muted-foreground text-center max-w-sm">
          Selecione um ambiente na lista à esquerda ou adicione um novo para
          configurar trechos e produtos.
        </p>
      </div>
    );
  }

  const sections = location.sections || [];
  const locationImages = location.images || [];
  const availableItems = sections.flatMap((s) => s.items || []);

  const sectionsToRender = selectedSectionId
    ? sections.filter((s) => (s.id as string) === selectedSectionId)
    : sections;

  return (
    <div className="flex-1 min-h-0">
      <div className="p-4 md:p-6 space-y-6">
        {/* Header do Local */}
        <div className={`flex items-center ${environmentsExpanded ? 'justify-between' : 'justify-start gap-4'} border-b-2 border-primary pb-4`}>
          <div className="flex items-center gap-2">
            {locationIndex >= 0 && (
              <span className="text-sm font-mono text-primary/60 shrink-0">
                {sectionNumber}.{locationIndex + 1}
              </span>
            )}
            <EditableTitle
              value={location.name}
              onSave={handleNameSave}
              disabled={isReadOnly}
              className={`${environmentsExpanded ? 'text-2xl' : 'text-lg'} font-bold text-primary tracking-tight`}
            />
          </div>
          {environmentsExpanded && !isReadOnly && (
            <div className="flex gap-1">
              {onDuplicateLocation && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => onDuplicateLocation(locationId)}
                  title="Duplicar ambiente"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicar
                </Button>
              )}
              {onDeleteLocation && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => onDeleteLocation(locationId, location.name)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir Ambiente
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Observações do Ambiente */}
        {environmentsExpanded && (
          <div>
            <button
              type="button"
              onClick={() => setNotesOpen((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground uppercase hover:text-foreground transition-colors"
            >
              {notesOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              Observações
              {hasNotes && !notesOpen && <span className="ml-1 text-xs normal-case text-primary">(preenchido)</span>}
            </button>
            {notesOpen && (
              <div className="mt-2 space-y-2">
                {isReadOnly ? (
                  <div
                    className="prose prose-sm max-w-none border rounded-md p-3 bg-muted/20 text-sm"
                    dangerouslySetInnerHTML={{
                      __html:
                        currentDescription && currentDescription !== "<p></p>"
                          ? currentDescription
                          : "<p class=\"text-muted-foreground\">Sem observações.</p>",
                    }}
                  />
                ) : (
                  <>
                    <RichTextEditor
                      key={locationId}
                      value={currentDescription}
                      onChange={handleDescriptionChange}
                      placeholder="Observações sobre o ambiente..."
                    />
                    {isDirty && (
                      <div className="flex justify-end">
                        <Button size="sm" variant="default" onClick={handleSaveDescription}>
                          <Save className="w-3 h-3 mr-1.5" />
                          Salvar observações
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Fotos do Ambiente */}
        {environmentsExpanded && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground uppercase">Fotos do Ambiente</h3>
            <BudgetImageGallery
              images={locationImages}
              onAdd={() => setAddPhotoOpen(true)}
              onEdit={(img) => setEditingImage(img)}
              onDelete={handleDeleteImage}
              emptyMessage="Nenhuma foto. Clique em Adicionar Foto para começar."
              addButtonLabel="Adicionar Foto"
              readOnly={isReadOnly}
            />
          </div>
        )}

        <BudgetPhotoAnnotatorDialog
          budgetId={budgetId}
          locationId={locationId}
          availableItems={availableItems}
          open={addPhotoOpen}
          onOpenChange={setAddPhotoOpen}
          onRefresh={onRefresh}
          onSaved={() => {
            setAddPhotoOpen(false);
            onRefresh();
          }}
        />

        <BudgetPhotoAnnotatorDialog
          budgetId={budgetId}
          locationId={locationId}
          imageId={editingImage?.id}
          availableItems={availableItems}
          initialImageUrl={(() => {
          const raw = editingImage?.url || editingImage?.composed_url;
          return raw ? (typeof window !== "undefined" ? new URL(raw, window.location.origin).href : raw) : null;
        })()}
          initialAnnotations={(editingImage?.annotations ?? []) as unknown as ImageAnnotation[]}
          initialEditorViewport={parseAnnotatorViewport(editingImage?.editor_viewport)}
          initialCaption={editingImage?.caption ?? ""}
          open={!!editingImage}
          onOpenChange={(open) => !open && setEditingImage(null)}
          onRefresh={onRefresh}
          onSaved={() => {
            setEditingImage(null);
            onRefresh();
          }}
        />

        {/* Trechos: empilhados como no escopo (pai) ou um só (filho selecionado na sidebar) */}
        <div className="space-y-6">
          {sections.length === 0 && (
            <div className="pl-4 border-l-2 border-dashed border-muted py-4 text-sm text-muted-foreground">
              Nenhum trecho criado neste ambiente ainda.
            </div>
          )}

          {sectionsToRender.map((section) => (
            <SectionDetail
              key={section.id as string}
              sectionId={section.id as string}
              locationId={locationId}
              section={budgetSectionToScopeSection(section, budgetId, locationId)}
              budgetId={budgetId}
              isReadOnly={isReadOnly}
              onRefresh={onRefresh}
              locations={scopeLocations}
            />
          ))}

          {!selectedSectionId && !isReadOnly && (
            <div className="pt-2">
              <InlineSectionCreator
                locationId={locationId}
                budgetId={budgetId}
                onSuccess={onRefresh}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

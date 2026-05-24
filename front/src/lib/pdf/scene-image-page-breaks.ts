/** Altura A4 em pontos (react-pdf). */
export const PDF_A4_PAGE_H = 841.89;

/**
 * Altura útil na página interna do detalhamento (margens + cabeçalho/rodapé + título da seção).
 * Espelha `pageContentMax` em `proposal-document.tsx`.
 */
export const PDF_DETAIL_PAGE_CONTENT_H =
    PDF_A4_PAGE_H - 35 - 108 - 35 - 44 - 28;

/** Altura aproximada de um bloco de cena no PDF (sceneImage 240pt + margens). */
export const PDF_SCENE_IMAGE_BLOCK_H = 252;

/** Altura aproximada do rótulo acima da primeira imagem de um lote (FOTOS DO LOCAL / título do trecho). */
export const PDF_SCENE_IMAGE_LEAD_H = 28;

/**
 * Controla quebra de página: foto do local e foto do trecho em folhas distintas.
 */
export function createSceneImagePageBreakController() {
    let imagesSeen = 0;

    return {
        priorImageCount(): number {
            return imagesSeen;
        },
        /**
         * Nova folha antes de cada foto do local (exceto a 1ª do documento).
         * `suppressBreak`: folha já aberta por `<Text break />` antes do bloco do local.
         */
        nextLocationPhotoSlot(opts?: { suppressBreak?: boolean }): boolean {
            const pageBreak = !opts?.suppressBreak && imagesSeen > 0;
            imagesSeen += 1;
            return pageBreak;
        },
        /**
         * Nova folha antes de cada foto do trecho.
         * `afterLocationPhotos`: força folha nova após fotos do local no mesmo local.
         * `suppressBreak`: folha já aberta por `<Text break />` entre local e trecho.
         */
        nextSectionPhotoSlot(
            afterLocationPhotos: boolean,
            opts?: { suppressBreak?: boolean }
        ): boolean {
            const pageBreak =
                !opts?.suppressBreak && (imagesSeen > 0 || afterLocationPhotos);
            imagesSeen += 1;
            return pageBreak;
        },
    };
}

export type SceneImagePaginationState = {
    page: number;
    y: number;
    imagesSeen: number;
};

/**
 * Coloca uma imagem de cena na estimativa de paginação.
 * Devolve o número da página onde a figura começa.
 */
export function placeSceneImageInPaginationEstimate(
    state: SceneImagePaginationState,
    pageContentMax: number,
    opts?: { leadHeight?: number; forcePageBreak?: boolean; suppressBreak?: boolean }
): number {
    const leadHeight = Math.max(0, opts?.leadHeight ?? 0);
    const forcePageBreak = Boolean(opts?.forcePageBreak);
    const suppressBreak = Boolean(opts?.suppressBreak);
    if (!suppressBreak && (state.imagesSeen > 0 || forcePageBreak)) {
        state.page += 1;
        state.y = 0;
    }
    const blockHeight = leadHeight + PDF_SCENE_IMAGE_BLOCK_H;
    if (state.y > 0 && state.y + blockHeight > pageContentMax) {
        state.page += 1;
        state.y = 0;
    }
    const imagePage = state.page;
    state.y += blockHeight;
    state.imagesSeen += 1;
    return imagePage;
}

/**
 * Quadro de exibição das figuras no escopo (proporção próxima à folha A4).
 * Retrato = estreito e alto; paisagem = largo e baixo — mesmo critério do `object-contain` na galeria.
 */

export type FigureFrameOrientation = "portrait" | "landscape";

/** Largura/altura do quadro (A4 em mm, só a razão importa). */
export const FIGURE_FRAME_ASPECT_PORTRAIT = 210 / 297;
export const FIGURE_FRAME_ASPECT_LANDSCAPE = 297 / 210;

export function figureFrameAspectRatio(orientation: FigureFrameOrientation): number {
    return orientation === "portrait" ? FIGURE_FRAME_ASPECT_PORTRAIT : FIGURE_FRAME_ASPECT_LANDSCAPE;
}

export function defaultFigureFrameOrientation(imgW: number, imgH: number): FigureFrameOrientation {
    if (!Number.isFinite(imgW) || !Number.isFinite(imgH) || imgW <= 0 || imgH <= 0) {
        return "landscape";
    }
    return imgH >= imgW ? "portrait" : "landscape";
}

export function parseFigureFrameOrientation(
    raw: unknown,
): FigureFrameOrientation | undefined {
    if (raw === "portrait" || raw === "landscape") return raw;
    return undefined;
}

/**
 * Retângulo (em pixels da imagem exibida no Konva) do quadro de exibição:
 * menor retângulo com a proporção escolhida que contém toda a imagem (áreas vazias = letterbox na UI).
 */
export function computeDisplayFrameRectInImagePixels(
    imgW: number,
    imgH: number,
    orientation: FigureFrameOrientation,
): { x: number; y: number; width: number; height: number } {
    const ar = figureFrameAspectRatio(orientation);
    const iw = imgW;
    const ih = imgH;
    const imgAr = iw / ih;
    let fw: number;
    let fh: number;
    if (imgAr <= ar) {
        fh = ih;
        fw = fh * ar;
    } else {
        fw = iw;
        fh = fw / ar;
    }
    return {
        x: (iw - fw) / 2,
        y: (ih - fh) / 2,
        width: fw,
        height: fh,
    };
}

// Utilitários para cálculos geométricos e conversão de coordenadas

import { Point } from '../tools/types';

/**
 * Converte coordenadas absolutas (pixels) para relativas (0-1)
 * @param x Coordenada X em pixels
 * @param y Coordenada Y em pixels
 * @param imageWidth Largura da imagem em pixels
 * @param imageHeight Altura da imagem em pixels
 */
export function toRelativeCoordinates(
    x: number,
    y: number,
    imageWidth: number,
    imageHeight: number
): Point {
    return {
        x: x / imageWidth,
        y: y / imageHeight
    };
}

/**
 * Converte coordenadas relativas (0-1) para absolutas (pixels)
 * @param point Ponto com coordenadas relativas
 * @param imageWidth Largura da imagem em pixels
 * @param imageHeight Altura da imagem em pixels
 */
export function toAbsoluteCoordinates(
    point: Point,
    imageWidth: number,
    imageHeight: number
): { x: number; y: number } {
    return {
        x: point.x * imageWidth,
        y: point.y * imageHeight
    };
}

/**
 * Calcula a distância entre dois pontos
 */
export function distance(p1: Point, p2: Point): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calcula o ângulo entre dois pontos (em radianos)
 */
export function angle(p1: Point, p2: Point): number {
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

/**
 * Gera um ID único para anotações
 */
export function generateAnnotationId(): string {
    return `annotation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

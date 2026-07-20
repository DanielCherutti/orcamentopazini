import React from "react";
import { Image, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type {
  HeaderFooterCanvasElement,
  HeaderFooterCanvasLayout,
  HeaderFooterPageNumberingConfig,
} from "@/types/budget-compositor-types";
import type { PdfEmbeddedImages } from "@/lib/pdf/pdf-image-src";
import { proxyPdfImageSrc } from "@/lib/pdf/pdf-image-src";
import { sanitizeTextForPdf } from "@/lib/pdf/sanitize-pdf-text";
import {
  normalizeHeaderFooterLayout,
  normalizePageNumbering,
  type HeaderFooterLayoutRegion,
} from "@/lib/compositor/header-footer-layout";

const DEBUG_PDF_LAYER_ORDER =
  typeof process !== "undefined" && process.env && process.env.DEBUG_PDF_LAYER_ORDER === "1";
const EDITOR_A4_HEIGHT_PX = 1122;
const PDF_A4_HEIGHT_PT = 841.89;
const EDITOR_PX_TO_PT = PDF_A4_HEIGHT_PT / EDITOR_A4_HEIGHT_PX;

interface HeaderFooterPdfLayerProps {
  layouts: Array<HeaderFooterCanvasLayout | undefined>;
  pageScope: "cover" | "inner";
  region: HeaderFooterLayoutRegion;
  width: number;
  height: number;
  appPublicUrl?: string;
  pdfEmbeddedImages?: PdfEmbeddedImages;
  pageNumbering?: HeaderFooterPageNumberingConfig;
}

type HeaderFooterPdfElementData = HeaderFooterCanvasElement & {
  _origin: "all" | "scope";
};

export function HeaderFooterPdfLayer({
  layouts,
  pageScope,
  width,
  height,
  appPublicUrl,
  pdfEmbeddedImages,
  pageNumbering,
}: HeaderFooterPdfLayerProps) {
  // local variable removed - use module-level `DEBUG_PDF_LAYER_ORDER`

  const elements = layouts
    .flatMap((layout, layoutIdx) =>
      normalizeHeaderFooterLayout(layout).elements.map(
        (el): HeaderFooterPdfElementData => ({
          ...el,
          _origin: layoutIdx === 0 ? "all" : "scope",
        }),
      ),
    )
    .sort((a, b) => {
      const z = Number(a.z_index) - Number(b.z_index);
      if (z !== 0) return z;
      return a._origin.localeCompare(b._origin);
    });
  const dedupedElements = elements.filter(
    (element, index, all) => all.findIndex((candidate) => candidate.id === element.id) === index,
  );

  const visibleElements = dedupedElements.filter((element) => {
    if (element.type === "image") {
      const src = element.src ? proxyPdfImageSrc(element.src, appPublicUrl, pdfEmbeddedImages) ?? element.src : "";
      if (!src) return false;
    }
    if (element.type === "page_number") {
      return shouldRenderPositionedPageNumber(element, pageNumbering, pageScope);
    }
    return true;
  });

  if (!visibleElements.length) return <View style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />;

  return (
    <View style={{ position: "absolute", left: 0, top: 0, width, height }}>
      {visibleElements.map((element) =>
        element.type === "image" ? (
          <HeaderFooterPdfElement
            key={element.id}
            element={element}
            width={width}
            height={height}
            appPublicUrl={appPublicUrl}
            pdfEmbeddedImages={pdfEmbeddedImages}
            pageNumbering={pageNumbering}
            pageScope={pageScope}
          />
        ) : (
          /*
           * React-PDF drops text inside nested absolute boxes in fixed bands, so text
           * remains a direct node. Keeping it in this single map is also essential:
           * siblings are painted in source order and must follow z_index across types.
           */
          <PositionedHeaderFooterText
            key={element.id}
            element={element}
            width={width}
            height={height}
            pageNumbering={pageNumbering}
            pageScope={pageScope}
          />
        ),
      )}
    </View>
  );
}

export function hasAnyHeaderFooterPdfLayout(
  layouts: Array<HeaderFooterCanvasLayout | undefined>,
): boolean {
  return layouts.some((layout) => normalizeHeaderFooterLayout(layout).elements.length > 0);
}

export function PaginationProbeText({
  paginationCollector,
  paginationProbeKey,
}: {
  paginationCollector?: { segmentStartPages: Record<string, number> };
  paginationProbeKey?: string;
}) {
  if (!paginationCollector || !paginationProbeKey) return null;
  return (
    <Text
      fixed
      style={{ position: "absolute", left: 0, top: 0, opacity: 0, fontSize: 1 }}
      render={({ pageNumber }) => {
        const prev = paginationCollector.segmentStartPages[paginationProbeKey];
        if (!Number.isFinite(prev) || pageNumber < prev) {
          // eslint-disable-next-line react-hooks/immutability -- coletor mutavel usado pela primeira passada do React-PDF
          paginationCollector.segmentStartPages[paginationProbeKey] = pageNumber;
        }
        return "";
      }}
    />
  );
}

function HeaderFooterPdfElement({
  element,
  width,
  height,
  appPublicUrl,
  pdfEmbeddedImages,
  pageNumbering,
  pageScope,
}: {
  element: HeaderFooterPdfElementData;
  width: number;
  height: number;
  appPublicUrl?: string;
  pdfEmbeddedImages?: PdfEmbeddedImages;
  pageNumbering?: HeaderFooterPageNumberingConfig;
  pageScope?: "cover" | "inner";
}) {
  const box = elementBoxStyle(element, width, height);
  const textStyle = textBoxStyle(element);

  if (element.type === "image") {
    const src = element.src
      ? proxyPdfImageSrc(element.src, appPublicUrl, pdfEmbeddedImages) ?? element.src
      : "";
    if (!src) return <View style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />;
    return (
      <>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
        <Image src={src} style={imageBoxStyle(element, width, height)} />
        {DEBUG_PDF_LAYER_ORDER ? (
          <Text
            style={{ position: "absolute", left: box.left, top: box.top, fontSize: 6, color: "#ff0000" }}
          >
            {`img z=${element.z_index}`}
          </Text>
        ) : null}
      </>
    );
  }

  if (element.type === "columns") {
    const columns = (element.columns?.length ? element.columns : ["", "", ""]).slice(0, 3);
    return (
      <View style={[box, { flexDirection: "row" }]}>
        {columns.map((column, index) => (
          <View
            key={`${element.id}-col-${index}`}
            style={{
              flex: 1,
              padding: editorPxToPt(element.padding ?? 4),
            }}
          >
            {renderTextWithPageNumbers(column, textStyle, pageNumbering, pageScope)}
          </View>
        ))}
      </View>
    );
  }

  if (element.type === "page_number") {
    const cfg = normalizePageNumbering(pageNumbering);
    if (!shouldRenderPositionedPageNumber(element, pageNumbering, pageScope)) {
      return <View style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />;
    }

    return (
      <View style={box}>
        <Text
          style={textStyle}
          render={({ pageNumber, totalPages }) => {
            if (pageNumber < cfg.start_at_page) return "";
            const current = Math.max(0, pageNumber - cfg.start_at_page + cfg.first_page_number);
            const total = Math.max(current, totalPages - cfg.start_at_page + cfg.first_page_number);
            return formatManualPageNumber(element.text || "{{page}} / {{total}}", current, total);
          }}
        />
      </View>
    );
  }
  return (
    <View style={box}>
      {renderTextWithPageNumbers(element.text ?? "", textStyle, pageNumbering, pageScope)}
      {DEBUG_PDF_LAYER_ORDER ? (
        <Text style={{ position: "absolute", left: box.left, top: box.top, fontSize: 6, color: "#ff0000" }}>
          {`txt z=${element.z_index}`}
        </Text>
      ) : null}
    </View>
  );
}

function shouldRenderPositionedPageNumber(
  _element: HeaderFooterPdfElementData,
  pageNumbering: HeaderFooterPageNumberingConfig | undefined,
  pageScope?: "cover" | "inner",
): boolean {
  const cfg = normalizePageNumbering(pageNumbering);
  if (!cfg.enabled) return false;
  if (pageScope === "cover" && (cfg.hide_on_cover || cfg.inner_only)) return false;
  return true;
}

function PositionedHeaderFooterText({
  element,
  width,
  height,
  pageNumbering,
  pageScope,
}: {
  element: HeaderFooterPdfElementData;
  width: number;
  height: number;
  pageNumbering?: HeaderFooterPageNumberingConfig;
  pageScope?: "cover" | "inner";
}) {
  const cfg = normalizePageNumbering(pageNumbering);
  if (element.type === "columns") {
    const columns = (element.columns?.length ? element.columns : ["", "", ""]).slice(0, 3);
    const box = positionedTextBoxStyle(element, width, height);
    const columnWidth = Number(box.width ?? 0) / Math.max(1, columns.length);
    return (
      <>
        {columns.map((column, index) => {
          return (
            <Text
              key={`${element.id}-col-${index}`}
              style={[
                textStyleWithoutLineHeight(textBoxStyle(element)),
                {
                  ...box,
                  left: Number(box.left ?? 0) + columnWidth * index,
                  width: columnWidth,
                },
              ]}
            >
              {sanitizeTextForPdf(column)}
            </Text>
          );
        })}
      </>
    );
  }

  return (
    <Text
      style={[
        textStyleWithoutLineHeight(textBoxStyle(element)),
        positionedTextBoxStyle(element, width, height),
      ]}
      render={({ pageNumber, totalPages }) => {
        if (element.type !== "page_number") {
          const text = sanitizeTextForPdf(element.text ?? "");
          if (!/\{\{\s*(page|total)\s*\}\}/i.test(text)) return text;
        }
        if (pageNumber < cfg.start_at_page) return "";
        if (pageScope === "cover" && (cfg.hide_on_cover || cfg.inner_only)) return "";
        const current = Math.max(0, pageNumber - cfg.start_at_page + cfg.first_page_number);
        const total = Math.max(current, totalPages - cfg.start_at_page + cfg.first_page_number);
        return formatManualPageNumber(
          element.type === "page_number" ? element.text || "{{page}} / {{total}}" : element.text ?? "",
          current,
          total,
        );
      }}
    />
  );
}

function positionedTextBoxStyle(element: HeaderFooterCanvasElement, width: number, height: number): Style {
  return {
    ...elementBoxStyle(element, width, height),
    minHeight: (clamp(element.height_pct, 1, 100) / 100) * height,
  };
}

export function renderTextWithPageNumbers(
  rawText: string,
  textStyle: Style,
  pageNumbering?: HeaderFooterPageNumberingConfig,
  pageScope?: "cover" | "inner",
) {
  const text = sanitizeTextForPdf(rawText);
  const cfg = normalizePageNumbering(pageNumbering);
  const containsPageTokens = /\{\{\s*(page|total)\s*\}\}/i.test(text);

  if (!containsPageTokens) {
    return <Text style={textStyle}>{text}</Text>;
  }

  return (
    <Text
      style={textStyleWithoutLineHeight(textStyle)}
      render={({ pageNumber, totalPages }) => {
        if (!cfg.enabled || pageNumber < cfg.start_at_page) {
          return text.replace(/\{\{\s*page\s*\}\}/gi, "").replace(/\{\{\s*total\s*\}\}/gi, "");
        }
        if (pageScope === "cover" && (cfg.hide_on_cover || cfg.inner_only)) {
          return text.replace(/\{\{\s*page\s*\}\}/gi, "").replace(/\{\{\s*total\s*\}\}/gi, "");
        }
        const current = Math.max(0, pageNumber - cfg.start_at_page + cfg.first_page_number);
        const total = Math.max(current, totalPages - cfg.start_at_page + cfg.first_page_number);
        return formatManualPageNumber(text, current, total);
      }}
    />
  );
}

function elementBoxStyle(element: HeaderFooterCanvasElement, width: number, height: number): Style {
  const boxWidth = (clamp(element.width_pct, 1, 100) / 100) * width;
  const boxHeight = (clamp(element.height_pct, 1, 100) / 100) * height;
  return compactPdfStyle({
    position: "absolute" as const,
    left: (clamp(element.x_pct, 0, 100) / 100) * width,
    top: (clamp(element.y_pct, 0, 100) / 100) * height,
    width: boxWidth,
    height: boxHeight,
    opacity: clamp(element.opacity ?? 1, 0, 1),
    backgroundColor:
      element.background_color && element.background_color !== "transparent"
        ? element.background_color
        : undefined,
    ...(element.border_color && element.border_color !== "transparent"
      ? { borderColor: element.border_color, borderWidth: 0.5 }
      : {}),
    padding: editorPxToPt(element.padding ?? 4),
    transform: element.rotate_deg ? `rotate(${element.rotate_deg}deg)` : undefined,
  });
}

function imageBoxStyle(element: HeaderFooterCanvasElement, width: number, height: number): Style {
  const boxWidth = (clamp(element.width_pct, 1, 100) / 100) * width;
  const boxHeight = (clamp(element.height_pct, 1, 100) / 100) * height;
  return compactPdfStyle({
    position: "absolute" as const,
    left: (clamp(element.x_pct, 0, 100) / 100) * width,
    top: (clamp(element.y_pct, 0, 100) / 100) * height,
    width: boxWidth,
    height: boxHeight,
    objectFit: "contain",
    objectPosition: "center",
    opacity: clamp(element.opacity ?? 1, 0, 1),
    transform: element.rotate_deg ? `rotate(${element.rotate_deg}deg)` : undefined,
  });
}

function textBoxStyle(element: HeaderFooterCanvasElement): Style {
  const fontSize = editorPxToPt(clamp(element.font_size ?? 11, 6, 96));
  return {
    fontSize,
    fontFamily: pdfFontFamily(element.font_family),
    color: element.color || "#111827",
    fontWeight: element.font_weight === "bold" ? 700 : 400,
    fontStyle: element.font_style === "italic" ? "italic" : "normal",
    textAlign: element.text_align || "left",
  };
}

function pdfFontFamily(value: string | undefined): string {
  const family = value?.trim();
  if (!family || family === "Arial" || family === "Verdana") return "Helvetica";
  if (family === "Times New Roman" || family === "Georgia") return "Times-Roman";
  if (family === "Courier New") return "Courier";
  return family;
}

function editorPxToPt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return (Number.isFinite(n) ? n : 0) * EDITOR_PX_TO_PT;
}

function textStyleWithoutLineHeight(style: Style): Style {
  const { lineHeight: _lineHeight, ...rest } = style;
  return rest;
}

function compactPdfStyle(style: Style): Style {
  return Object.fromEntries(
    Object.entries(style).filter(([, value]) => value !== undefined)
  ) as Style;
}

function formatManualPageNumber(template: string, pageNumber: number, totalPages: number): string {
  return sanitizeTextForPdf(template)
    .replace(/\{\{\s*page\s*\}\}/gi, String(pageNumber))
    .replace(/\{\{\s*total\s*\}\}/gi, String(totalPages));
}

function clamp(value: unknown, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

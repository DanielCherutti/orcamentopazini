import type {
  BudgetBlock,
  HeaderFooterCanvasElement,
  HeaderFooterCanvasLayout,
} from "@/types/budget-compositor-types";
import type { CompositorPdfPayload } from "@/components/pdf/compositor-pdf-types";
import {
  renderTemplateVariables,
  type TemplateVariableContext,
} from "@/lib/model-variables";

const HTML_PROP_KEYS = new Set([
  "cover_document_html",
  "cover_header_html",
  "cover_footer_html",
  "inner_header_html",
  "inner_footer_html",
  "description",
  "content",
]);

const URL_PROP_KEYS = new Set([
  "client_logo_url",
  "cover_watermark_url",
  "document_watermark_url",
  "inner_watermark_url",
]);

const LAYOUT_PROP_KEYS = new Set([
  "all_header_layout",
  "all_footer_layout",
  "cover_header_layout",
  "cover_footer_layout",
  "inner_header_layout",
  "inner_footer_layout",
]);

function renderLayoutElementVariables(
  element: HeaderFooterCanvasElement,
  context: TemplateVariableContext,
): HeaderFooterCanvasElement {
  const next: HeaderFooterCanvasElement = { ...element };
  if (next.text != null) {
    const pageToken = "__PAZINI_PAGE_NUMBER__";
    const totalToken = "__PAZINI_TOTAL_PAGES__";
    const protectedText = next.text
      .replace(/\{\{\s*page\s*\}\}/gi, pageToken)
      .replace(/\{\{\s*total\s*\}\}/gi, totalToken);
    next.text = renderTemplateVariables(protectedText, context, {
      logoMode: "url",
      escapeText: false,
    })
      .replaceAll(pageToken, "{{page}}")
      .replaceAll(totalToken, "{{total}}");
  }
  if (next.src != null) {
    next.src = renderTemplateVariables(next.src, context, {
      logoMode: "url",
      escapeText: false,
    });
  }
  if (Array.isArray(next.columns)) {
    next.columns = next.columns.map((column) =>
      renderTemplateVariables(column, context, {
        logoMode: "url",
        escapeText: false,
      }),
    );
  }
  return next;
}

function renderLayoutVariables(
  raw: unknown,
  context: TemplateVariableContext,
): HeaderFooterCanvasLayout | unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const layout = raw as HeaderFooterCanvasLayout;
  return {
    ...layout,
    version: 1 as const,
    elements: Array.isArray(layout.elements)
      ? layout.elements.map((element) => renderLayoutElementVariables(element, context))
      : [],
  };
}

function renderBlockPropsVariables(
  props: Record<string, unknown>,
  context: TemplateVariableContext,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...props };
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "string" && HTML_PROP_KEYS.has(key)) {
      next[key] = renderTemplateVariables(value, context, {
        logoMode: "img",
        escapeText: true,
      });
      continue;
    }
    if (typeof value === "string" && URL_PROP_KEYS.has(key)) {
      next[key] = renderTemplateVariables(value, context, {
        logoMode: "url",
        escapeText: false,
      });
      continue;
    }
    if (LAYOUT_PROP_KEYS.has(key)) {
      next[key] = renderLayoutVariables(value, context);
    }
  }
  return next;
}

function renderBlockVariables(
  block: BudgetBlock,
  context: TemplateVariableContext,
): BudgetBlock {
  return {
    ...block,
    props: renderBlockPropsVariables(block.props ?? {}, context),
    children: block.children.map((child) => renderBlockVariables(child, context)),
  };
}

export function renderCompositorPdfVariables(
  payload: CompositorPdfPayload | undefined,
  context: TemplateVariableContext,
): CompositorPdfPayload | undefined {
  if (!payload) return payload;
  return {
    ...payload,
    roots: payload.roots.map((root) => renderBlockVariables(root, context)),
  };
}

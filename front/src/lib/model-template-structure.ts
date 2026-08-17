import {
  DEFAULT_COVER_PROPS,
  DEFAULT_HEADER_FOOTER_PROPS,
  type CoverBlockProps,
  type HeaderFooterBlockProps,
  type HeaderFooterCanvasElement,
} from "@/types/budget-compositor-types";
import { normalizeHeaderFooterLayout } from "@/lib/compositor/header-footer-layout";

export type ModelTemplateBlockType =
  | "cover"
  | "header_footer"
  | "figures"
  | "toc"
  | "scope"
  | "session"
  | "text"
  | "quote";

export type ModelTemplateBlock = {
  id: string;
  parent_id: string | null;
  type: ModelTemplateBlockType;
  label: string;
  order_index: number;
  props: Record<string, unknown>;
};

export type ModelTemplateStructure =
  | { version: 1; kind: "header_footer"; props: HeaderFooterBlockProps }
  | { version: 1; kind: "cover"; props: CoverBlockProps }
  | { version: 1; kind: "budget"; blocks: ModelTemplateBlock[] };

type ModeloTipo = "cabecalho" | "rodape" | "capa" | "orcamento_completo" | "databook_completo";

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cloneHeaderFooterDefaults(): HeaderFooterBlockProps {
  return JSON.parse(JSON.stringify(DEFAULT_HEADER_FOOTER_PROPS)) as HeaderFooterBlockProps;
}

function defaultTextElement(text: string, options?: Partial<HeaderFooterCanvasElement>): HeaderFooterCanvasElement {
  return {
    id: createId("elemento"),
    type: "text",
    x_pct: 6,
    y_pct: 20,
    width_pct: 88,
    height_pct: 55,
    z_index: 1,
    opacity: 1,
    text,
    font_size: 11,
    font_weight: "normal",
    font_style: "normal",
    text_align: "left",
    color: "#111827",
    background_color: "transparent",
    border_color: "transparent",
    padding: 4,
    ...options,
  };
}

function defaultHeaderFooterStructure(tipo: "cabecalho" | "rodape"): ModelTemplateStructure {
  const props = cloneHeaderFooterDefaults();
  if (tipo === "cabecalho") {
    props.cover_show_header_band = true;
    props.inner_show_header_band = true;
    props.all_header_layout = {
      version: 1,
      elements: [
        defaultTextElement("{{cliente.razao_social}}", {
          font_size: 13,
          font_weight: "bold",
        }),
      ],
    };
  } else {
    props.cover_show_footer_band = true;
    props.inner_show_footer_band = true;
    props.all_footer_layout = {
      version: 1,
      elements: [
        defaultTextElement("Orçamento {{orcamento.codigo}}", {
          width_pct: 56,
          font_size: 9,
        }),
        {
          ...defaultTextElement("{{page}} / {{total}}", {
            x_pct: 70,
            width_pct: 24,
            font_size: 9,
            text_align: "right",
            z_index: 2,
          }),
          type: "page_number",
        },
      ],
    };
  }
  return { version: 1, kind: "header_footer", props };
}

function defaultCoverStructure(content?: string): ModelTemplateStructure {
  return {
    version: 1,
    kind: "cover",
    props: {
      ...DEFAULT_COVER_PROPS,
      cover_document_html:
        content?.trim() ||
        '<h1 style="text-align:center">PROPOSTA COMERCIAL</h1><p style="text-align:center">{{cliente.razao_social}}</p><p style="text-align:center">Orçamento {{orcamento.codigo}}</p>',
    },
  };
}

function defaultBudgetStructure(content?: string): ModelTemplateStructure {
  const coverId = createId("capa");
  const headerFooterId = createId("cabecalho-rodape");
  const sectionId = createId("secao");
  return {
    version: 1,
    kind: "budget",
    blocks: [
      {
        id: coverId,
        parent_id: null,
        type: "cover",
        label: "CAPA",
        order_index: 0,
        props: (defaultCoverStructure() as Extract<ModelTemplateStructure, { kind: "cover" }>).props as Record<string, unknown>,
      },
      {
        id: headerFooterId,
        parent_id: null,
        type: "header_footer",
        label: "CABEÇALHO E RODAPÉ",
        order_index: 1,
        props: cloneHeaderFooterDefaults() as Record<string, unknown>,
      },
      {
        id: createId("lista-figuras"),
        parent_id: null,
        type: "figures",
        label: "LISTA DE FIGURAS",
        order_index: 2,
        props: {},
      },
      {
        id: createId("sumario"),
        parent_id: null,
        type: "toc",
        label: "SUMÁRIO",
        order_index: 3,
        props: {},
      },
      {
        id: sectionId,
        parent_id: null,
        type: "session",
        label: "APRESENTAÇÃO",
        order_index: 4,
        props: {
          description:
            content?.trim() ||
            "<p>Apresentamos esta proposta comercial para <strong>{{cliente.razao_social}}</strong>.</p>",
          page_break_before: false,
        },
      },
      {
        id: createId("detalhamento"),
        parent_id: null,
        type: "scope",
        label: "DETALHAMENTO DO PROJETO",
        order_index: 5,
        props: {},
      },
      {
        id: createId("orcamento"),
        parent_id: null,
        type: "quote",
        label: "ORÇAMENTO",
        order_index: 6,
        props: {},
      },
    ],
  };
}

export function createModelTemplateStructure(tipo: ModeloTipo, legacyContent = ""): ModelTemplateStructure {
  if (tipo === "cabecalho" || tipo === "rodape") {
    const structure = defaultHeaderFooterStructure(tipo);
    if (legacyContent.trim() && structure.kind === "header_footer") {
      const field = tipo === "cabecalho" ? "all_header_layout" : "all_footer_layout";
      structure.props[field] = {
        version: 1,
        elements: [defaultTextElement(htmlToPlainText(legacyContent))],
      };
    }
    return structure;
  }
  if (tipo === "capa") return defaultCoverStructure(legacyContent);
  if (tipo === "databook_completo") {
    const structure = defaultBudgetStructure(legacyContent);
    if (structure.kind === "budget") {
      structure.blocks = structure.blocks
        .filter((block) => !["quote", "scope", "toc", "figures"].includes(block.type))
        .map((block) =>
          block.type === "cover"
            ? {
                ...block,
                props: {
                  ...block.props,
                  main_title: "DATABOOK TÉCNICO",
                  subtitle: "Documentação de instalação e inspeção",
                  cover_document_html:
                    '<h1 style="text-align:center">DATABOOK TÉCNICO</h1><p style="text-align:center">{{cliente.razao_social}}</p>',
                },
              }
            : block,
        );
    }
    return structure;
  }
  return defaultBudgetStructure(legacyContent);
}

export function normalizeModelTemplateStructure(
  tipo: ModeloTipo,
  raw: unknown,
  legacyContent = "",
): ModelTemplateStructure {
  if (!raw || typeof raw !== "object") return createModelTemplateStructure(tipo, legacyContent);
  const source = raw as Record<string, unknown>;

  if ((tipo === "cabecalho" || tipo === "rodape") && source.kind === "header_footer") {
    const rawProps = isRecord(source.props) ? source.props : {};
    const props: HeaderFooterBlockProps = {
      ...cloneHeaderFooterDefaults(),
      ...rawProps,
    };
    props.all_header_layout = normalizeHeaderFooterLayout(props.all_header_layout);
    props.all_footer_layout = normalizeHeaderFooterLayout(props.all_footer_layout);
    props.cover_header_layout = normalizeHeaderFooterLayout(props.cover_header_layout);
    props.cover_footer_layout = normalizeHeaderFooterLayout(props.cover_footer_layout);
    props.inner_header_layout = normalizeHeaderFooterLayout(props.inner_header_layout);
    props.inner_footer_layout = normalizeHeaderFooterLayout(props.inner_footer_layout);
    return { version: 1, kind: "header_footer", props };
  }

  if (tipo === "capa" && source.kind === "cover") {
    const props = isRecord(source.props) ? source.props : {};
    return {
      version: 1,
      kind: "cover",
      props: {
        ...DEFAULT_COVER_PROPS,
        ...props,
        cover_document_html: String(props.cover_document_html ?? legacyContent ?? ""),
      },
    };
  }

  if ((tipo === "orcamento_completo" || tipo === "databook_completo") && source.kind === "budget" && Array.isArray(source.blocks)) {
    const parsedBlocks = source.blocks
      .filter(isRecord)
      .map((block, index): ModelTemplateBlock | null => {
        const storedType = String(block.type ?? "") as ModelTemplateBlockType;
        if (!["cover", "header_footer", "figures", "toc", "scope", "session", "text", "quote"].includes(storedType)) return null;
        // No modelo comercial, o antigo "Texto" filho representava na prática
        // uma subseção sem número. Promovemos para `session`, preservando conteúdo.
        const type = tipo === "orcamento_completo" && storedType === "text" ? "session" : storedType;
        const rawProps = isRecord(block.props) ? block.props : {};
        let props = rawProps;
        if (storedType === "text" && type === "session") {
          const { content: legacyTextContent, ...rest } = rawProps;
          props = {
            ...rest,
            description: String(rawProps.description ?? legacyTextContent ?? ""),
            page_break_before: rawProps.page_break_before === true,
          };
        }
        return {
          id: String(block.id || createId(type)),
          parent_id: block.parent_id ? String(block.parent_id) : null,
          type,
          label: String(block.label || defaultBlockLabel(type)),
          order_index: Number.isFinite(Number(block.order_index)) ? Number(block.order_index) : index,
          props,
        };
      })
      .filter((block): block is ModelTemplateBlock => block !== null);
    if (parsedBlocks.length) {
      return {
        version: 1,
        kind: "budget",
        blocks: tipo === "orcamento_completo"
          ? ensureBudgetSystemBlocks(parsedBlocks)
          : parsedBlocks.filter((block) => !["quote", "scope", "toc", "figures"].includes(block.type)),
      };
    }
  }

  return createModelTemplateStructure(tipo, legacyContent);
}

export function modelTemplateToLegacyContent(structure: ModelTemplateStructure): string {
  if (structure.kind === "cover") return structure.props.cover_document_html ?? "";
  if (structure.kind === "header_footer") {
    const layouts = [
      structure.props.all_header_layout,
      structure.props.all_footer_layout,
      structure.props.cover_header_layout,
      structure.props.cover_footer_layout,
      structure.props.inner_header_layout,
      structure.props.inner_footer_layout,
    ];
    return layouts
      .flatMap((layout) => normalizeHeaderFooterLayout(layout).elements)
      .map((element) => element.text ?? (element.type === "image" ? element.src ?? "" : ""))
      .filter(Boolean)
      .join("\n");
  }
  return structure.blocks
    .filter((block) => block.type === "session" || block.type === "text")
    .map((block) => String(block.props.content ?? block.props.description ?? ""))
    .filter(Boolean)
    .join("\n");
}

export function defaultBlockLabel(type: ModelTemplateBlockType): string {
  if (type === "cover") return "CAPA";
  if (type === "header_footer") return "CABEÇALHO E RODAPÉ";
  if (type === "figures") return "LISTA DE FIGURAS";
  if (type === "toc") return "SUMÁRIO";
  if (type === "scope") return "DETALHAMENTO DO PROJETO";
  if (type === "quote") return "ORÇAMENTO";
  if (type === "session") return "NOVA SEÇÃO";
  return "Novo texto";
}

/**
 * Atualiza modelos antigos para os blocos estruturais atuais sem descartar as
 * seções já configuradas. Blocos ausentes entram em posições previsíveis; a
 * Lista de Figuras fica acima do Sumário e o Detalhamento antes do Orçamento.
 */
function ensureBudgetSystemBlocks(blocks: ModelTemplateBlock[]): ModelTemplateBlock[] {
  let roots = blocks
    .filter((block) => block.parent_id === null)
    .sort((a, b) => a.order_index - b.order_index);
  const children = blocks.filter((block) => block.parent_id !== null);
  const makeSystem = (type: ModelTemplateBlockType): ModelTemplateBlock => ({
      id: createId(type),
      parent_id: null,
      type,
      label: defaultBlockLabel(type),
      order_index: 0,
      props: type === "cover"
        ? (defaultCoverStructure() as Extract<ModelTemplateStructure, { kind: "cover" }>).props as Record<string, unknown>
        : type === "header_footer"
          ? cloneHeaderFooterDefaults() as Record<string, unknown>
          : {},
  });
  const ensureAt = (type: ModelTemplateBlockType, index: number) => {
    if (roots.some((block) => block.type === type)) return;
    roots.splice(Math.max(0, Math.min(index, roots.length)), 0, makeSystem(type));
  };

  ensureAt("cover", 0);
  ensureAt("header_footer", roots.findIndex((block) => block.type === "cover") + 1);

  // Índices automáticos ficam juntos e sempre na ordem solicitada: figuras antes do sumário.
  const figures = roots.find((block) => block.type === "figures") ?? makeSystem("figures");
  const toc = roots.find((block) => block.type === "toc") ?? makeSystem("toc");
  roots = roots.filter((block) => block.type !== "figures" && block.type !== "toc");
  const headerIndex = roots.findIndex((block) => block.type === "header_footer");
  roots.splice(headerIndex >= 0 ? headerIndex + 1 : 0, 0, figures, toc);

  if (!roots.some((block) => block.type === "scope")) {
    const quoteIndex = roots.findIndex((block) => block.type === "quote");
    roots.splice(quoteIndex >= 0 ? quoteIndex : roots.length, 0, makeSystem("scope"));
  }
  ensureAt("quote", roots.length);

  return [
    ...roots.map((block, order_index) => ({ ...block, parent_id: null, order_index })),
    ...children,
  ];
}

function htmlToPlainText(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

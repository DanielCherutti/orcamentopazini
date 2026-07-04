import type { DatabookTemplateArea } from "@/types/databook-template-types";

function checklist(...items: string[]): DatabookTemplateArea["checklist"] {
    return items.map((text) => ({ text }));
}

/** Estrutura base do memorial C.Vale OB.26.419 — usada no seed do DataBook padrão. */
export const BUILTIN_DATABOOK_CVALE_AREAS: DatabookTemplateArea[] = [
    {
        code: "AD-01",
        title: "Classificação",
        checklist: checklist("Instalação de rodapé no guarda-corpo existente (20 m)"),
    },
    {
        code: "AD-02",
        title: "Moega",
        checklist: checklist(
            "Portão bipartido (~5,90 m × 2,00 m)",
            "Alçapão de acesso 0,80 × 0,80 m",
            "Monopé de resgate com base",
            "Escada vertical de acesso interno",
            "Gradil metálico 2,00 m — fechamentos laterais",
        ),
    },
    {
        code: "AD-03",
        title: "Casa de máquina",
        checklist: checklist(
            "Guarda-corpo com rodapé na rampa de saída (11 m)",
            "Guarda-corpo com rodapé na escada existente (3 m)",
            "Escada marinheiro com linha de vida",
            "Rodapé e guarda-corpo na plataforma",
        ),
    },
    {
        code: "AD-04",
        title: "Elevador casa de máquinas",
        checklist: checklist(
            "Linha de vida na seção negativa (~8 m)",
            "Alçapão de acesso 0,80 × 0,80 m",
            "Plataforma de descanso abaixo do alçapão",
            "Troca de guarda-corpos conforme NR-12",
        ),
    },
    {
        code: "AD-05",
        title: "Secador",
        checklist: checklist(
            "Degraus antiderrapantes e linha de vida vertical",
            "Plataforma de descanso 0,80 × 1,50 m",
            "Rodapé em plataformas existentes",
            "Monopé de resgate com base articulada",
            "Escadas e plataformas de acesso interno",
        ),
    },
    {
        code: "AD-06",
        title: "Elevadores do secador",
        checklist: checklist(
            "Proteções NR-12 nas janelas de inspeção",
            "Linha de vida vertical até cabeça do elevador",
            "Plataformas a cada 6,00 m (EL-02)",
            "Plataforma interligando elevadores EL-02 e EL-03",
            "Monopé de resgate EL-04 (15 kN)",
        ),
    },
    {
        code: "AD-07",
        title: "Silo pulmão",
        checklist: checklist(
            "Linha de vida vertical (~5,50 m)",
            "Troca guarda-corpo e rodapé da plataforma",
            "Plataforma 2,00 × 1,00 m",
            "Monopé de resgate fixado nos montantes",
            "Porta de acesso 1,20 × 1,00 m",
        ),
    },
    {
        code: "AD-08",
        title: "Tulha de expedição",
        checklist: checklist(
            "Rodapé na escada e perimetro de plataformas",
            "Alçapões 0,80 × 0,80 m com bases de resgate",
            "Linhas de vida horizontal dentro da tulha (16 m)",
            "Substituição de guarda-corpos NR-12 (35 m)",
            "Escada-rampa com guarda-corpo, rodapé e corrimão",
        ),
    },
    {
        code: "AD-09",
        title: "Armazém graneleiro",
        checklist: checklist(
            "Plataforma padrão de resgate 2,0 × 1,0 m",
            "Rodapé na escada (10 m total)",
            "Escada marinheiro com linha de vida",
            "Gradis tipo Otis 2\" — fechamentos NR-12",
        ),
    },
    {
        code: "AD-10",
        title: "Transportador superior",
        checklist: checklist(
            "Linha de vida vertical 25,00 m na escada",
            "Rodapé ao longo da fita (20 cm)",
        ),
    },
    {
        code: "AD-11",
        title: "Reservatório de água",
        checklist: checklist(
            "Linha de vida na escada (12 m)",
            "Rodapé em torno do reservatório (6 m)",
        ),
    },
    {
        code: "AD-12",
        title: "Balança",
        checklist: checklist(
            "Rodapé na escada com plataforma (3 m + 6 m)",
            "Guarda-corpo com rodapé nas laterais (40 m)",
        ),
    },
];

export const BUILTIN_DATABOOK_CVALE_SEED = {
    name: "C.Vale — Adequação NR-12 / NR-35",
    description:
        "Memorial técnico padrão com áreas AD-01 a AD-12 (referência OB.26.419 — Santa Rita do Trivelato).",
    client_label: "C.Vale",
    default_deadline_days: 90,
    areas: BUILTIN_DATABOOK_CVALE_AREAS,
} as const;

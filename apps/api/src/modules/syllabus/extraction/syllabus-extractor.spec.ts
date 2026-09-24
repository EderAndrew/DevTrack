import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SyllabusExtractionSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { docx, textPdf } from "../../../../test/fixtures/syllabus/build-fixtures";
import { API_ROOT } from "../../../../test/helpers/env";
import type { SourceLine } from "./source-line";
import { extractSyllabus, structureSyllabus, UnreadableSyllabusError } from "./syllabus-extractor";

const fixture = (name: string) => readFileSync(resolve(API_ROOT, "test/fixtures/syllabus", name));
const expected = () => JSON.parse(fixture("poo.expected.json").toString("utf8")) as unknown;

/** PDF-like lines: markers typed in the text, wrapped lines continue the previous one. */
const pdf = (...texts: (string | [string, "bold"])[]): SourceLine[] =>
  texts.map((entry) =>
    typeof entry === "string"
      ? { text: entry, emphasis: false, list: null, wraps: true }
      : { text: entry[0], emphasis: true, list: null, wraps: true },
  );

describe("004/SC-005 004/FR-019 extrator versão 1 — teste de ouro (research E10)", () => {
  it.each([
    ["poo.pdf", "PDF"],
    ["poo.docx", "DOCX"],
  ] as const)("%s produz exatamente poo.expected.json: 4 grupos e 16 itens na ordem", async (name, mediaType) => {
    const outcome = await extractSyllabus(fixture(name), mediaType);
    expect(outcome.result).toBe("TEXT");
    expect(outcome.extraction).toEqual(expected());
    expect(outcome.extraction.groups).toHaveLength(4);
    expect(outcome.extraction.groups.flatMap((group) => group.items)).toHaveLength(16);
    expect(SyllabusExtractionSchema.parse(outcome.extraction)).toEqual(outcome.extraction);
  });

  it("duas execuções sobre o mesmo arquivo dão o mesmo JSON", async () => {
    for (const [name, mediaType] of [
      ["poo.pdf", "PDF"],
      ["poo.docx", "DOCX"],
    ] as const) {
      const first = JSON.stringify(await extractSyllabus(fixture(name), mediaType));
      const second = JSON.stringify(await extractSyllabus(fixture(name), mediaType));
      expect(second).toBe(first);
    }
  });

  it("004/FR-019 lê todas as páginas de um PDF maior", async () => {
    const outcome = await extractSyllabus(fixture("dez-paginas.pdf"), "PDF");
    expect(outcome.result).toBe("TEXT");
    expect(outcome.extraction.groups.flatMap((group) => group.items)).toHaveLength(16 * 10);
  });

  it("PDF escaneado (só imagem) → NO_TEXT", async () => {
    const outcome = await extractSyllabus(fixture("escaneado.pdf"), "PDF");
    expect(outcome).toEqual({
      result: "NO_TEXT",
      extraction: { extractorVersion: 1, title: null, syllabusText: null, competencyText: null, groups: [] },
    });
  });

  it.each([
    ["ementa.png", "PNG"],
    ["ementa.jpg", "JPEG"],
  ] as const)("004/FR-020 %s → NO_TEXT sem OCR", async (name, mediaType) => {
    expect((await extractSyllabus(fixture(name), mediaType)).result).toBe("NO_TEXT");
  });

  it("arquivo ilegível → UnreadableSyllabusError", async () => {
    await expect(extractSyllabus(fixture("corrompido.pdf"), "PDF")).rejects.toBeInstanceOf(UnreadableSyllabusError);
    await expect(extractSyllabus(Buffer.from("PK\u0003\u0004quebrado"), "DOCX")).rejects.toBeInstanceOf(
      UnreadableSyllabusError,
    );
  });
});

describe("004/FR-019 regras de estrutura em amostras em memória (research E10)", () => {
  it("numeração mista: 1. abre grupo; 1.1, a), -, • viram itens; linha quebrada continua o item", () => {
    const extraction = structureSyllabus(
      pdf(
        "Estruturas de Dados",
        "Conteúdo programático:",
        "1. Listas",
        "1.1 Listas encadeadas",
        "1.2 Pilhas e filas",
        "2) Árvores",
        "a) Árvores binárias de busca",
        "b) Árvores balanceadas com",
        "rotações simples e duplas",
        "II. Grafos",
        "- Busca em largura",
        "• Busca em profundidade",
      ),
    );
    expect(extraction.title).toBe("Estruturas de Dados");
    expect(extraction.groups).toEqual([
      { title: "Listas", items: ["Listas encadeadas", "Pilhas e filas"] },
      { title: "Árvores", items: ["Árvores binárias de busca", "Árvores balanceadas com rotações simples e duplas"] },
      { title: "Grafos", items: ["Busca em largura", "Busca em profundidade"] },
    ]);
  });

  it("título em negrito sem número abre grupo; itens antes de qualquer grupo caem num grupo sem título", () => {
    const extraction = structureSyllabus(
      pdf("Conteúdos", "• Introdução", ["Parte prática", "bold"], "• Laboratório 1", "• Laboratório 2"),
    );
    expect(extraction.groups).toEqual([
      { title: null, items: ["Introdução"] },
      { title: "Parte prática", items: ["Laboratório 1", "Laboratório 2"] },
    ]);
  });

  it("rótulos em inglês e rótulo com texto na mesma linha", () => {
    const extraction = structureSyllabus(
      pdf(
        "Databases",
        "Syllabus: Relational model and SQL.",
        "Competencies",
        "Design normalized schemas.",
        "Learning Objectives",
        "1. Modeling",
        "- Entities and relationships",
      ),
    );
    expect(extraction).toEqual({
      extractorVersion: 1,
      title: "Databases",
      syllabusText: "Relational model and SQL.",
      competencyText: "Design normalized schemas.",
      groups: [{ title: "Modeling", items: ["Entities and relationships"] }],
    });
  });

  it("rótulos sem acento nem maiúsculas e seções ignoradas (bibliografia) encerram a anterior", () => {
    const extraction = structureSyllabus(
      pdf("Algoritmos", "EMENTA", "Estudo de algoritmos.", "Bibliografia", "CORMEN, T. Algoritmos.", "competencia", "Resolver problemas."),
    );
    expect(extraction.syllabusText).toBe("Estudo de algoritmos.");
    expect(extraction.competencyText).toBe("Resolver problemas.");
    expect(extraction.groups).toEqual([]);
  });

  it("sem seção de objetos, as listas do documento viram grupos e itens; texto solto é ignorado", () => {
    const extraction = structureSyllabus(
      pdf(
        "Redes",
        "Ementa",
        "Fundamentos de redes.",
        "Bibliografia",
        "Texto livre que não é lista.",
        "1. Camada física",
        "- Meios de transmissão",
      ),
    );
    expect(extraction.syllabusText).toBe("Fundamentos de redes.");
    expect(extraction.groups).toEqual([{ title: "Camada física", items: ["Meios de transmissão"] }]);
  });

  it("lista numerada simples (só primeiro nível) vira um grupo sem título com os itens", () => {
    const extraction = structureSyllabus(pdf("Conteúdos", "1. Variáveis", "2. Laços", "3. Funções"));
    expect(extraction.groups).toEqual([{ title: null, items: ["Variáveis", "Laços", "Funções"] }]);
  });

  it("DOCX: parágrafo sem numeração dentro de objetos é um item (não continua o anterior)", () => {
    const docxLine = (text: string, list: SourceLine["list"] = null): SourceLine => ({ text, emphasis: false, list, wraps: false });
    const extraction = structureSyllabus([
      docxLine("Cálculo"),
      docxLine("Objetos de aprendizagem"),
      docxLine("Limites", "group"),
      docxLine("Definição", "item"),
      docxLine("Propriedades"),
      docxLine("Ementa"),
      docxLine("Primeiro parágrafo."),
      docxLine("Segundo parágrafo."),
    ]);
    expect(extraction.groups).toEqual([{ title: "Limites", items: ["Definição", "Propriedades"] }]);
    expect(extraction.syllabusText).toBe("Primeiro parágrafo.\nSegundo parágrafo.");
  });

  it("PDF e DOCX montados em memória com outra ementa também são extraídos", async () => {
    const sample = {
      title: "Banco de Dados",
      syllabusText: "Modelagem relacional, normalização e SQL.",
      competencyText: "Projetar bancos de dados relacionais.",
      groups: [{ title: "Modelagem", items: ["Entidades e relacionamentos", "Normalização"] }],
    };
    const fromDocx = await extractSyllabus(docx(sample), "DOCX");
    expect(fromDocx.extraction).toEqual({ extractorVersion: 1, ...sample });

    const fromPdf = await extractSyllabus(
      textPdf([
        [
          { text: "Banco de Dados", bold: true },
          { text: "Ementa", bold: true },
          { text: "Modelagem relacional, normalização e SQL." },
          { text: "Conteúdo Programático", bold: true },
          { text: "1. Modelagem", bold: true },
          { text: "- Entidades e relacionamentos" },
          { text: "- Normalização" },
        ],
      ]),
      "PDF",
    );
    expect(fromPdf.extraction).toEqual({
      extractorVersion: 1,
      title: "Banco de Dados",
      syllabusText: "Modelagem relacional, normalização e SQL.",
      competencyText: null,
      groups: sample.groups,
    });
  });
});

import type { CurriculumExtractionOutput } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { checkGrounding, norm } from "./grounding";

const empty: CurriculumExtractionOutput = { title: null, syllabusText: null, competencyText: null, groups: [], warnings: [] };
const items = (...texts: string[]) => texts.map((text) => ({ text, sourceRef: null }));
const blocks = (...texts: string[]) => texts.map((text) => ({ text }));

describe("007/FR-021 verificação determinística de apoio no documento (research C8)", () => {
  it("\"Encapsulamento e herança.\" apoia \"Encapsulamento\" e \"herança\", mas não \"Polimorfismo\"", () => {
    const extraction = { ...empty, groups: [{ title: null, items: items("Encapsulamento", "herança", "Polimorfismo") }] };
    expect(checkGrounding(extraction, blocks("Encapsulamento e herança.")).unsupported).toEqual([
      { field: "item", groupIndex: 0, itemIndex: 2 },
    ]);
  });

  it("quebra de linha, marcador de lista, acentos, caixa e pontuação são absorvidos", () => {
    const extraction = {
      ...empty,
      groups: [
        {
          title: "1. FUNDAMENTOS DE POO",
          items: items("• Conceitos de classes, objetos e métodos", "ENCAPSULAMENTO, heranca e polimorfismo", "- Associações e composição"),
        },
      ],
    };
    const document = blocks(
      "1. Fundamentos de POO",
      "• Conceitos de classes,",
      "objetos e métodos.",
      "a) Encapsulamento, herança e polimorfismo;",
      "Associações e composição de objetos.",
    );
    expect(checkGrounding(extraction, document).unsupported).toEqual([]);
  });

  it("título de grupo e campos de texto também são verificados", () => {
    const extraction: CurriculumExtractionOutput = {
      title: "Programação Orientada a Objetos",
      syllabusText: "Exploração dos princípios da POO.",
      competencyText: "Capacitar os alunos a usar Spring Boot.",
      groups: [{ title: "Padrões de Projeto", items: items("SOLID") }],
      warnings: [],
    };
    const document = blocks("Programação Orientada a Objetos", "Ementa", "Exploração dos princípios da POO.", "Princípios SOLID");
    expect(checkGrounding(extraction, document).unsupported).toEqual([
      { field: "competencyText", groupIndex: null, itemIndex: null },
      { field: "groupTitle", groupIndex: 0, itemIndex: null },
    ]);
  });

  it("palavra inteira: \"Java\" não é apoiado por \"JavaScript\"; texto vazio após normalizar não tem apoio", () => {
    const extraction = { ...empty, groups: [{ title: null, items: items("Java", "—", "JavaScript") }] };
    expect(checkGrounding(extraction, blocks("Introdução a JavaScript.")).unsupported).toEqual([
      { field: "item", groupIndex: 0, itemIndex: 0 },
      { field: "item", groupIndex: 0, itemIndex: 1 },
    ]);
  });

  it("nenhum item é removido: a verificação só aponta", () => {
    const extraction = { ...empty, title: "Inventado", groups: [{ title: "Outro", items: items("Streams", "Generics") }] };
    const before = structuredClone(extraction);
    const { unsupported } = checkGrounding(extraction, blocks("Nada disso aqui."));
    expect(unsupported).toHaveLength(4);
    expect(extraction).toEqual(before);
  });

  it("norm: NFKC, minúsculas, sem acentos, sem marcador inicial, pontuação vira espaço", () => {
    expect(norm("  2) Ｃlasses, OBJETOS  e\nmétodos!  ")).toBe("classes objetos e metodos");
    expect(norm("– Herança; polimorfismo")).toBe("heranca polimorfismo");
    expect(norm("C++ e C#")).toBe("c e c");
  });
});

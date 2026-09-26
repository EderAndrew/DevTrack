import type { CurriculumExtractionOutput } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { filterSourceRefs, formatSourceRef } from "./source-refs";

const blocks = [
  { ref: "p1.1", text: "Objetos de Aprendizagem" },
  { ref: "p1.2", text: "• Conceitos de classes, objetos e" },
  { ref: "p1.3", text: "métodos." },
  { ref: "p2.1", text: "• Encapsulamento, herança e polimorfismo" },
];

const withRefs = (...pairs: [string, string | null][]): CurriculumExtractionOutput => ({
  title: null,
  syllabusText: null,
  competencyText: null,
  groups: [{ title: null, items: pairs.map(([text, sourceRef]) => ({ text, sourceRef })) }],
  warnings: [],
});

const refsOf = (extraction: CurriculumExtractionOutput) => extraction.groups[0]!.items.map((item) => item.sourceRef);

describe("007/FR-023 referências de origem (research C9)", () => {
  it("mantém a ref do bloco que contém o item, também quando o item continua no bloco seguinte", () => {
    const extraction = withRefs(["Encapsulamento, herança e polimorfismo", "p2.1"], ["Conceitos de classes, objetos e métodos", "p1.2"]);
    expect(refsOf(filterSourceRefs(extraction, blocks))).toEqual(["p2.1", "p1.2"]);
  });

  it("ref inexistente ou de bloco sem o texto é descartada, nunca trocada por outra", () => {
    const extraction = withRefs(
      ["Encapsulamento, herança e polimorfismo", "p9.9"],
      ["Encapsulamento, herança e polimorfismo", "p1.1"],
      ["Polimorfismo paramétrico", "p2.1"],
      ["Encapsulamento", "page:2"],
      ["Encapsulamento", null],
    );
    expect(refsOf(filterSourceRefs(extraction, blocks))).toEqual([null, null, null, null, null]);
  });

  it("não altera a extração recebida nem o texto dos itens", () => {
    const extraction = withRefs(["Encapsulamento", "p9.9"]);
    const result = filterSourceRefs(extraction, blocks);
    expect(extraction.groups[0]!.items[0]!.sourceRef).toBe("p9.9");
    expect(result.groups[0]!.items[0]).toEqual({ text: "Encapsulamento", sourceRef: null });
  });

  it("formatSourceRef: página ou parágrafo", () => {
    expect(formatSourceRef("p3.12")).toEqual({ kind: "page", n: 3 });
    expect(formatSourceRef("par41")).toEqual({ kind: "paragraph", n: 41 });
    expect(formatSourceRef("l3")).toBeNull();
  });
});

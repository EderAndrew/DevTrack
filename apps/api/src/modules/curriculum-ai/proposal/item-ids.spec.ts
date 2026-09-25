import { type CurriculumExtractionOutput, SaveSyllabusRevisionRequestSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { itemIdsOf, projectAccepted } from "./item-ids";

const extraction: CurriculumExtractionOutput = {
  title: "Programação Orientada a Objetos",
  syllabusText: null,
  competencyText: "Capacitar os alunos.",
  groups: [
    { title: "Fundamentos", items: [{ text: "Classes", sourceRef: "p1.3" }, { text: "Objetos", sourceRef: null }] },
    { title: null, items: [{ text: "SOLID", sourceRef: null }] },
    { title: "Práticas", items: [{ text: "Testes", sourceRef: null }] },
  ],
  warnings: [{ code: "FIELD_NOT_FOUND", field: "syllabusText", groupIndex: null }],
};

describe("007 ids de item e projeção do que foi aceito", () => {
  it("campos identificados e depois group:<i>, na ordem", () => {
    expect(itemIdsOf(extraction)).toEqual(["title", "competencyText", "group:0", "group:1", "group:2"]);
  });

  it("007/FR-017 nada identificado → nenhum id", () => {
    expect(itemIdsOf({ title: null, syllabusText: null, competencyText: null, groups: [], warnings: [] })).toEqual([]);
  });

  it("campo não aceito vira null; grupo não aceito sai, e os demais mantêm a ordem", () => {
    const draft = projectAccepted(extraction, ["competencyText", "group:2", "group:0"]);
    expect(draft).toEqual({
      title: null,
      syllabusText: null,
      competencyText: "Capacitar os alunos.",
      groups: [
        { title: "Fundamentos", items: [{ text: "Classes" }, { text: "Objetos" }] },
        { title: "Práticas", items: [{ text: "Testes" }] },
      ],
    });
    expect(SaveSyllabusRevisionRequestSchema.safeParse(draft).success).toBe(true);
  });

  it("tudo aceito: o rascunho tem todo o conteúdo, sem ref nem aviso", () => {
    const draft = projectAccepted(extraction, itemIdsOf(extraction));
    expect(draft.title).toBe(extraction.title);
    expect(draft.groups.map((g) => g.items.length)).toEqual([2, 1, 1]);
    expect(JSON.stringify(draft)).not.toMatch(/sourceRef|warnings|p1\.3/);
  });
});

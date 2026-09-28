import { type CurriculumExtractionOutputV2, CurriculumProposalContentSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { buildCurriculumProposal, READ_CURRICULUM_DOCUMENT } from "./build-proposal";
import type { CurriculumDocumentContent } from "./document-content";

const DOCUMENT_ID = "3f0e7c7e-8a38-4c55-9d0b-2a4f5c0f6b11";
const SHA = "b".repeat(64);

const document = (text: string, patch: Partial<CurriculumDocumentContent> = {}): CurriculumDocumentContent => ({
  documentId: DOCUMENT_ID,
  subjectName: "POO",
  mediaType: "PDF",
  readerVersion: 1,
  sha256: SHA,
  blocks: [
    { ref: "p1.1", kind: "heading", text: "Programação Orientada a Objetos" },
    { ref: "p1.2", kind: "item", text },
  ],
  languages: [
    { key: "java", name: "Java", aliases: [] },
    { key: "cpp", name: "C++", aliases: ["cpp"] },
  ],
  ...patch,
});

const output: CurriculumExtractionOutputV2 = {
  title: "Programação Orientada a Objetos",
  syllabusText: null,
  competencyText: null,
  groups: [
    {
      title: null,
      items: [
        { text: "Encapsulamento", sourceRef: "p1.2" },
        { text: "Polimorfismo", sourceRef: "p1.2" },
      ],
    },
  ],
  warnings: [{ code: "FIELD_NOT_FOUND", field: "syllabusText", groupIndex: null }],
  languageKey: null,
};

const read = (value: unknown) => ({ toolKey: READ_CURRICULUM_DOCUMENT, output: value });

describe("007 buildCurriculumProposal (contracts/curriculum-agent.md)", () => {
  it("sem leitura bem-sucedida → null", () => {
    expect(buildCurriculumProposal(output, { toolResults: [] })).toBeNull();
    expect(buildCurriculumProposal(output, { toolResults: [{ toolKey: "outra", output: {} }] })).toBeNull();
  });

  it("007/FR-017 nada identificado → null", () => {
    const nothing = { title: null, syllabusText: null, competencyText: null, groups: [], warnings: [], languageKey: null };
    expect(buildCurriculumProposal(nothing, { toolResults: [read(document("x"))] })).toBeNull();
  });

  it("conteúdo com extração, apoio e origem (documentId, sha256, readerVersion); passa no schema", () => {
    const built = buildCurriculumProposal(output, { toolResults: [read(document("Encapsulamento e herança."))] })!;
    expect(built.itemIds).toEqual(["title", "group:0"]);
    expect(built.content.source).toEqual({ documentId: DOCUMENT_ID, sha256: SHA, readerVersion: 1 });
    expect(built.content.grounding.unsupported).toEqual([{ field: "item", groupIndex: 0, itemIndex: 1 }]);
    // The ref of the unsupported item is dropped; the supported one keeps it.
    expect(built.content.extraction.groups[0]!.items.map((item) => item.sourceRef)).toEqual(["p1.2", null]);
    expect(built.content.extraction.warnings).toEqual(output.warnings);
    expect(built.content.language).toBeNull();
    expect(built.content.extraction).not.toHaveProperty("languageKey");
    expect(CurriculumProposalContentSchema.parse(built.content)).toEqual(built.content);
  });

  it("usa a última leitura bem-sucedida", () => {
    const first = read(document("Nada.", { sha256: "c".repeat(64) }));
    const last = read(document("Encapsulamento e polimorfismo."));
    const built = buildCurriculumProposal(output, { toolResults: [first, last] })!;
    expect(built.content.source.sha256).toBe(SHA);
    expect(built.content.grounding.unsupported).toEqual([]);
  });

  it("010/FR-041 a linguagem do catálogo vira item aceitável, com o nome do catálogo, e apoiada pelo texto", () => {
    const built = buildCurriculumProposal({ ...output, languageKey: "java" }, { toolResults: [read(document("Encapsulamento e polimorfismo em Java."))] })!;
    expect(built.itemIds).toEqual(["title", "language", "group:0"]);
    expect(built.content.language).toEqual({ key: "java", name: "Java" });
    expect(built.content.grounding.unsupported).toEqual([]);
    expect(CurriculumProposalContentSchema.parse(built.content)).toEqual(built.content);
  });

  it("010/US7-8 linguagem ausente do texto (nome e apelidos) é sinalizada sem apoio; 'javascript' não apoia 'java'", () => {
    const built = buildCurriculumProposal({ ...output, languageKey: "java" }, { toolResults: [read(document("Encapsulamento e polimorfismo em JavaScript."))] })!;
    expect(built.content.language).toEqual({ key: "java", name: "Java" });
    expect(built.content.grounding.unsupported).toEqual([{ field: "language", groupIndex: null, itemIndex: null }]);
    const alias = buildCurriculumProposal({ ...output, languageKey: "cpp" }, { toolResults: [read(document("Encapsulamento e polimorfismo em cpp."))] })!;
    expect(alias.content.grounding.unsupported).toEqual([]);
  });

  it("010/US7-7 chave fora do catálogo devolvido vira nenhuma linguagem, nunca um valor novo", () => {
    const built = buildCurriculumProposal({ ...output, languageKey: "kotlin" }, { toolResults: [read(document("Encapsulamento e polimorfismo em Kotlin."))] })!;
    expect(built.content.language).toBeNull();
    expect(built.itemIds).toEqual(["title", "group:0"]);
  });

  it("saída ou resultado da ferramenta inválidos lançam erro (a execução falha)", () => {
    const { languageKey: _, ...withoutLanguage } = output;
    expect(() => buildCurriculumProposal(withoutLanguage, { toolResults: [read(document("x"))] })).toThrow();
    expect(() => buildCurriculumProposal({ ...output, confidence: 1 }, { toolResults: [read(document("x"))] })).toThrow();
    expect(() => buildCurriculumProposal(output, { toolResults: [read({ ...document("x"), extra: true })] })).toThrow();
  });
});

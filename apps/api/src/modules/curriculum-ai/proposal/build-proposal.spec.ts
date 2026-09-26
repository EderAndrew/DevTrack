import { type CurriculumExtractionOutput, CurriculumProposalContentSchema } from "@repo/contracts";
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
  ...patch,
});

const output: CurriculumExtractionOutput = {
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
};

const read = (value: unknown) => ({ toolKey: READ_CURRICULUM_DOCUMENT, output: value });

describe("007 buildCurriculumProposal (contracts/curriculum-agent.md)", () => {
  it("sem leitura bem-sucedida → null", () => {
    expect(buildCurriculumProposal(output, { toolResults: [] })).toBeNull();
    expect(buildCurriculumProposal(output, { toolResults: [{ toolKey: "outra", output: {} }] })).toBeNull();
  });

  it("007/FR-017 nada identificado → null", () => {
    const nothing = { title: null, syllabusText: null, competencyText: null, groups: [], warnings: [] };
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
    expect(CurriculumProposalContentSchema.parse(built.content)).toEqual(built.content);
  });

  it("usa a última leitura bem-sucedida", () => {
    const first = read(document("Nada.", { sha256: "c".repeat(64) }));
    const last = read(document("Encapsulamento e polimorfismo."));
    const built = buildCurriculumProposal(output, { toolResults: [first, last] })!;
    expect(built.content.source.sha256).toBe(SHA);
    expect(built.content.grounding.unsupported).toEqual([]);
  });

  it("saída ou resultado da ferramenta inválidos lançam erro (a execução falha)", () => {
    expect(() => buildCurriculumProposal({ ...output, confidence: 1 }, { toolResults: [read(document("x"))] })).toThrow();
    expect(() => buildCurriculumProposal(output, { toolResults: [read({ ...document("x"), extra: true })] })).toThrow();
  });
});

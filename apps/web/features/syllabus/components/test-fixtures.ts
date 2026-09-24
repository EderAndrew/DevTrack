import type { SyllabusDocumentDetail, SyllabusDocumentView, SyllabusExtraction } from "@repo/contracts";

let sequence = 0;

/** A `SyllabusDocumentView` of the contract for the web tests. */
export const documentView = (subjectId: string, overrides: Partial<SyllabusDocumentView> = {}): SyllabusDocumentView => {
  sequence += 1;
  return {
    id: `00000000-0000-4000-a000-${String(sequence).padStart(12, "0")}`,
    subjectId,
    version: 1,
    originalFilename: "ementa-poo.pdf",
    mediaType: "PDF",
    sizeBytes: 3012,
    pageCount: 1,
    processingStatus: "UPLOADED",
    failureCategory: null,
    extractionResult: null,
    attempts: 0,
    uploadedAt: "2026-09-23T15:00:00.000Z",
    processedAt: null,
    confirmedRevision: null,
    draftRevisionId: null,
    ...overrides,
  };
};

export const POO_EXTRACTION: SyllabusExtraction = {
  extractorVersion: 1,
  title: "Object-Oriented Programming",
  syllabusText: "Exploração dos princípios da programação orientada a objetos.",
  competencyText: "Capacitar os alunos a projetar soluções orientadas a objetos.",
  groups: [
    { title: "Fundamentos de POO", items: ["Conceitos de classes, objetos e métodos", "Encapsulamento, herança e polimorfismo"] },
    { title: "Padrões de Design em POO", items: ["Princípios SOLID"] },
  ],
};

/** A `SyllabusDocumentDetail`: the view plus the extraction and revisions. */
export const documentDetail = (
  view: SyllabusDocumentView,
  overrides: Partial<Pick<SyllabusDocumentDetail, "extraction" | "revisions">> = {},
): SyllabusDocumentDetail => ({ ...view, extraction: null, revisions: [], ...overrides });

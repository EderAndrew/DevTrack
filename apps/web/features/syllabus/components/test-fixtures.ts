import type {
  SyllabusDocumentDetail,
  SyllabusDocumentView,
  SyllabusExtraction,
  SyllabusRevisionView,
} from "@repo/contracts";

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

/** A `SyllabusRevisionView` built from `{title, items}` groups; ids follow the group and item positions. */
export const revisionView = (
  documentId: string,
  groups: { title: string | null; items: string[] }[] = [],
  overrides: Partial<SyllabusRevisionView> = {},
): SyllabusRevisionView => {
  sequence += 1;
  const id = `00000000-0000-4000-b000-${String(sequence).padStart(12, "0")}`;
  const built = groups.map((group, groupIndex) => ({
    id: `00000000-0000-4001-8${String(sequence).padStart(3, "0")}-${String(groupIndex + 1).padStart(12, "0")}`,
    position: groupIndex + 1,
    title: group.title,
    items: group.items.map((text, itemIndex) => ({
      id: `00000000-0000-4002-8${String(sequence).padStart(3, "0")}-${String((groupIndex + 1) * 1000 + itemIndex + 1).padStart(12, "0")}`,
      position: itemIndex + 1,
      text,
    })),
  }));
  return {
    id,
    documentId,
    number: 1,
    status: "DRAFT",
    source: "EXTRACTION",
    title: null,
    syllabusText: null,
    competencyText: null,
    groups: built,
    itemCount: built.reduce((sum, group) => sum + group.items.length, 0),
    confirmedAt: null,
    ...overrides,
  };
};

import type {
  ProgrammingLanguageView,
  SubjectView,
  SyllabusDocumentView,
  SyllabusRevisionView,
  WorkGenerationRequestView,
  WorkTeacherView,
} from "@repo/contracts";
import {
  apiError,
  json,
  subjectView,
} from "@/features/subjects/components/test-fixtures";
import { revisionView } from "@/features/syllabus/components/test-fixtures";

export { apiError, json };

export const JAVA: ProgrammingLanguageView = {
  id: "00000000-0000-4000-a000-000000000011",
  key: "java",
  name: "Java",
};
export const PYTHON: ProgrammingLanguageView = {
  id: "00000000-0000-4000-a000-000000000012",
  key: "python",
  name: "Python",
};

export const POO: SubjectView = subjectView("Programação Orientada a Objetos");

const DOCUMENT_ID = "00000000-0000-4000-b000-000000000011";

/** A confirmed syllabus of POO in Java: two groups, three and two items. */
export const POO_REVISION: SyllabusRevisionView = revisionView(
  DOCUMENT_ID,
  [
    {
      title: "Orientação a objetos",
      items: ["Herança", "Polimorfismo", "Interfaces"],
    },
    { title: "Coleções", items: ["Listas", "Mapas"] },
  ],
  {
    status: "CONFIRMED",
    confirmedAt: "2026-09-20T12:00:00.000Z",
    language: { id: JAVA.id, name: JAVA.name },
  },
);

/** Item id of the syllabus by its text. */
export const itemId = (text: string) =>
  POO_REVISION.groups
    .flatMap((group) => group.items)
    .find((item) => item.text === text)!.id;

export const POO_DOCUMENT: SyllabusDocumentView = {
  id: DOCUMENT_ID,
  subjectId: POO.id,
  version: 1,
  originalFilename: "ementa.pdf",
  mediaType: "PDF",
  sizeBytes: 1000,
  pageCount: 1,
  processingStatus: "PROCESSED",
  failureCategory: null,
  extractionResult: "TEXT",
  attempts: 1,
  uploadedAt: "2026-09-20T10:00:00.000Z",
  processedAt: "2026-09-20T10:01:00.000Z",
  confirmedRevision: { id: POO_REVISION.id, number: 1, source: "MANUAL" },
  draftRevisionId: null,
};

/** A `WorkTeacherView` of the contract, as the API answers a create. */
export const workView = (
  overrides: Partial<WorkTeacherView> = {},
): WorkTeacherView => ({
  id: "00000000-0000-4000-e000-000000000001",
  subject: { id: POO.id, name: POO.name },
  syllabusRevisionId: null,
  topics: [],
  title: "Trabalho",
  description: null,
  difficulty: null,
  totalGrade: "10.00",
  questionCount: 1,
  origin: "MANUAL",
  status: "APPROVED",
  archivedFromStatus: null,
  version: 1,
  humanReviewed: true,
  humanEdited: false,
  reviewedBy: { name: "Professora" },
  reviewedAt: "2026-09-30T12:00:00.000Z",
  generationRequestId: null,
  warnings: [],
  questions: [
    {
      id: "00000000-0000-4000-e000-000000000002",
      position: 0,
      type: "OPEN_ANSWER",
      gradingStrategy: "AI_REVIEW",
      value: "10.00",
      statement: "Enunciado",
      explanation: null,
      topicItemIds: [],
      expectedAnswer: "Resposta",
      rubric: null,
      isTrickQuestion: false,
    },
  ],
  createdAt: "2026-09-30T12:00:00.000Z",
  updatedAt: "2026-09-30T12:00:00.000Z",
  ...overrides,
});

/** A `WorkGenerationRequestView` of the contract: 5 questions on Herança and Polimorfismo. */
export const generationRequestView = (
  overrides: Partial<WorkGenerationRequestView> = {},
): WorkGenerationRequestView => ({
  id: "00000000-0000-4000-f000-000000000001",
  status: "PENDING",
  subject: { id: POO.id, name: POO.name },
  syllabusRevisionId: POO_REVISION.id,
  topics: [
    { syllabusItemId: itemId("Herança"), itemText: "Herança" },
    { syllabusItemId: itemId("Polimorfismo"), itemText: "Polimorfismo" },
  ],
  title: "Trabalho de herança",
  description: null,
  difficulty: "INTERMEDIATE",
  totalGrade: "2.00",
  total: 5,
  counts: { OPEN_ANSWER: 3, MULTIPLE_CHOICE: 2, CODE: 0 },
  trickQuestions: 1,
  language: null,
  distribution: "AUTO",
  executionId: "00000000-0000-4000-f000-000000000002",
  createdAt: "2026-09-30T12:00:00.000Z",
  generatedAt: null,
  failureCode: null,
  workId: null,
  regeneratedFromId: null,
  ...overrides,
});

/**
 * Answers the reads of the work form (languages, subjects, syllabus versions, revision) and hands
 * the writes to `onWrite`.
 */
export function workApiMock(
  onWrite: (url: string, body: unknown) => Response | Promise<Response>,
) {
  return async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = String(input);
    if (init?.method && init.method !== "GET")
      return onWrite(url, JSON.parse(String(init.body)));
    if (url === "/api/works/programming-languages")
      return json(200, [JAVA, PYTHON]);
    if (url.startsWith("/api/subjects?"))
      return json(200, { items: [POO], nextCursor: null });
    if (url === `/api/subjects/${POO.id}/syllabus-documents`)
      return json(200, { items: [POO_DOCUMENT] });
    if (url === `/api/syllabus-revisions/${POO_REVISION.id}`)
      return json(200, POO_REVISION);
    return apiError(404, "NOT_FOUND", "Não encontrado.");
  };
}

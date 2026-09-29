import type { ExerciseBatchView, ExerciseTeacherView, ProgrammingLanguageView, SubjectView, SyllabusDocumentView, SyllabusRevisionView } from "@repo/contracts";
import { apiError, json, subjectView } from "@/features/subjects/components/test-fixtures";
import { revisionView } from "@/features/syllabus/components/test-fixtures";

export { apiError, json };

export const JAVA: ProgrammingLanguageView = { id: "00000000-0000-4000-a000-000000000001", key: "java", name: "Java" };
export const PYTHON: ProgrammingLanguageView = { id: "00000000-0000-4000-a000-000000000002", key: "python", name: "Python" };

export const POO: SubjectView = subjectView("Programação Orientada a Objetos");

const DOCUMENT_ID = "00000000-0000-4000-b000-000000000001";

/** A confirmed syllabus of POO in Java, with one group of two items. */
export const POO_REVISION: SyllabusRevisionView = revisionView(DOCUMENT_ID, [{ title: "Orientação a objetos", items: ["Herança", "Interfaces"] }], {
  status: "CONFIRMED",
  confirmedAt: "2026-09-20T12:00:00.000Z",
  language: { id: JAVA.id, name: JAVA.name },
});

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

let sequence = 0;

/** An `ExerciseTeacherView` of the contract, as the API answers a create. */
export const exerciseView = (overrides: Partial<ExerciseTeacherView> = {}): ExerciseTeacherView => {
  sequence += 1;
  return {
    id: `00000000-0000-4000-c000-${String(sequence).padStart(12, "0")}`,
    type: "OPEN_ANSWER",
    statement: "Enunciado",
    explanation: "Explicação",
    difficulty: "BASIC",
    cognitiveObjective: "UNDERSTAND",
    origin: "MANUAL",
    status: "APPROVED",
    archivedFromStatus: null,
    version: 1,
    expectedAnswer: "Resposta",
    instructions: null,
    starterCode: null,
    expectedSolution: null,
    language: null,
    alternatives: [],
    isTrickQuestion: false,
    topic: null,
    humanReviewed: false,
    humanEdited: false,
    reviewedBy: null,
    reviewedAt: null,
    batchId: null,
    createdAt: "2026-09-28T12:00:00.000Z",
    updatedAt: "2026-09-28T12:00:00.000Z",
    ...overrides,
  };
};

/** An `ExerciseBatchView` on "Herança" of POO: PENDING, 3 open answers and 2 multiple choice. */
export const batchView = (overrides: Partial<ExerciseBatchView> = {}): ExerciseBatchView => ({
  id: "00000000-0000-4000-d000-000000000001",
  status: "PENDING",
  topic: { syllabusItemId: POO_REVISION.groups[0]!.items[0]!.id, syllabusRevisionId: POO_REVISION.id, itemText: "Herança", subjectName: POO.name },
  difficulty: "INTERMEDIATE",
  total: 5,
  counts: { OPEN_ANSWER: 3, MULTIPLE_CHOICE: 2, CODE: 0 },
  trickQuestions: 1,
  language: null,
  distribution: "AUTO",
  createdAt: "2026-09-28T12:00:00.000Z",
  generatedAt: null,
  failureCode: null,
  approved: 0,
  discarded: 0,
  archived: 0,
  pendingReview: 0,
  regeneratedFromId: null,
  ...overrides,
});

/**
 * Answers the reads of the form (languages, subjects, syllabus versions, revision) and hands
 * the writes to `onWrite`.
 */
export function exerciseApiMock(onWrite: (url: string, body: unknown) => Response | Promise<Response>) {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (init?.method && init.method !== "GET") return onWrite(url, JSON.parse(String(init.body)));
    if (url === "/api/programming-languages") return json(200, [JAVA, PYTHON]);
    if (url.startsWith("/api/subjects?")) return json(200, { items: [POO], nextCursor: null });
    if (url === `/api/subjects/${POO.id}/syllabus-documents`) return json(200, { items: [POO_DOCUMENT] });
    if (url === `/api/syllabus-revisions/${POO_REVISION.id}`) return json(200, POO_REVISION);
    return apiError(404, "NOT_FOUND", "Não encontrado.");
  };
}

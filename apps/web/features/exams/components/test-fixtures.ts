import type { ExamGenerationRequest, ExamSummary, ProgrammingLanguageView, SubjectView, SyllabusDocumentView, SyllabusRevisionView, TeacherExam } from "@repo/contracts";
import { apiError, json, subjectView } from "@/features/subjects/components/test-fixtures";
import { revisionView } from "@/features/syllabus/components/test-fixtures";

export { apiError, json };

export const JAVA: ProgrammingLanguageView = { id: "00000000-0000-4000-a000-000000000011", key: "java", name: "Java", highlight: "java" };

export const POO: SubjectView = subjectView("Programação Orientada a Objetos");

const DOCUMENT_ID = "00000000-0000-4000-b000-000000000021";

/** A confirmed syllabus of POO in Java: two groups, three and two items. */
export const POO_REVISION: SyllabusRevisionView = revisionView(
  DOCUMENT_ID,
  [
    { title: "Orientação a objetos", items: ["Herança", "Polimorfismo", "Interfaces"] },
    { title: "Coleções", items: ["Listas", "Mapas"] },
  ],
  { status: "CONFIRMED", confirmedAt: "2026-09-20T12:00:00.000Z", language: { id: JAVA.id, name: JAVA.name } },
);

/** Item id of the syllabus by its text. */
export const itemId = (text: string) =>
  POO_REVISION.groups.flatMap((group) => group.items).find((item) => item.text === text)!.id;

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

/** A `TeacherExam` of the contract: a DRAFT with two questions on "Herança", the second without difficulty. */
export const examView = (overrides: Partial<TeacherExam> = {}): TeacherExam => ({
  id: "00000000-0000-4000-e000-000000000101",
  subject: { id: POO.id, name: POO.name },
  syllabusRevisionId: POO_REVISION.id,
  topics: [{ syllabusItemId: itemId("Herança"), itemText: "Herança", groupTitle: "Orientação a objetos" }],
  title: "Prova de herança",
  description: null,
  totalGrade: "10.00",
  questionCount: 2,
  origin: "MANUAL",
  status: "DRAFT",
  archivedFromStatus: null,
  version: 1,
  humanReviewed: false,
  humanEdited: false,
  reviewedBy: null,
  reviewedAt: null,
  generationRequestId: null,
  warnings: [],
  questions: [
    {
      id: "00000000-0000-4000-e000-000000000102",
      position: 0,
      type: "OPEN_ANSWER",
      gradingStrategy: "AI_REVIEW",
      value: "5.00",
      difficulty: "BASIC",
      statement: "Explique herança.",
      explanation: null,
      topicIds: [itemId("Herança")],
      expectedAnswer: "Reuso por extensão.",
      rubric: null,
      isTrickQuestion: false,
    },
    {
      id: "00000000-0000-4000-e000-000000000103",
      position: 1,
      type: "OPEN_ANSWER",
      gradingStrategy: "AI_REVIEW",
      value: "5.00",
      difficulty: null,
      statement: "Explique polimorfismo.",
      explanation: null,
      topicIds: [itemId("Herança")],
      expectedAnswer: "Muitas formas.",
      rubric: null,
      isTrickQuestion: false,
    },
  ],
  createdAt: "2026-10-12T12:00:00.000Z",
  updatedAt: "2026-10-12T12:00:00.000Z",
  ...overrides,
});

export const examSummary = (overrides: Partial<ExamSummary> = {}): ExamSummary => ({
  id: "00000000-0000-4000-e000-000000000101",
  subject: { id: POO.id, name: POO.name },
  title: "Prova de herança",
  totalGrade: "10.00",
  questionCount: 2,
  origin: "MANUAL",
  status: "DRAFT",
  topics: [{ syllabusItemId: itemId("Herança"), itemText: "Herança" }],
  humanEdited: false,
  createdAt: "2026-10-12T12:00:00.000Z",
  updatedAt: "2026-10-12T12:00:00.000Z",
  ...overrides,
});

/** Answers the reads of the exam screens (languages, subjects, syllabus, revision) and hands the writes to `onWrite`. */
export function examApiMock(
  onWrite: (url: string, body: unknown) => Response | Promise<Response>,
  reads: Record<string, () => Response> = {},
) {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (init?.method && init.method !== "GET") return onWrite(url, JSON.parse(String(init.body)));
    if (reads[url]) return reads[url]();
    if (url === "/api/exams/programming-languages") return json(200, [JAVA]);
    if (url.startsWith("/api/subjects?")) return json(200, { items: [POO], nextCursor: null });
    if (url === `/api/subjects/${POO.id}/syllabus-documents`) return json(200, { items: [POO_DOCUMENT] });
    if (url === `/api/syllabus-revisions/${POO_REVISION.id}`) return json(200, POO_REVISION);
    return apiError(404, "NOT_FOUND", "Não encontrado.");
  };
}

/** An `ExamGenerationRequest` of the contract (018/US7): PENDING on Herança and Polimorfismo, 5 questions. */
export const examGenerationView = (overrides: Partial<ExamGenerationRequest> = {}): ExamGenerationRequest => ({
  id: "00000000-0000-4000-e000-000000000201",
  status: "PENDING",
  subject: { id: POO.id, name: POO.name },
  syllabusRevisionId: POO_REVISION.id,
  topics: [
    { syllabusItemId: itemId("Herança"), itemText: "Herança" },
    { syllabusItemId: itemId("Polimorfismo"), itemText: "Polimorfismo" },
  ],
  title: "Prova de herança",
  difficulty: "INTERMEDIATE",
  totalGrade: "10.00",
  quantity: 5,
  distribution: { OPEN_ANSWER: 2, MULTIPLE_CHOICE: 2, CODE: 1 },
  trickCount: 1,
  executionId: "00000000-0000-4000-e000-000000000202",
  createdAt: "2026-10-13T12:00:00.000Z",
  generatedAt: null,
  failureCode: null,
  examId: null,
  ...overrides,
});

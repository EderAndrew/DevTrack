import type { ClassView, ExerciseTeacherView, TeacherActivity, WorkSummary } from "@repo/contracts";

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
export const apiError = (status: number, code: string, message: string) => json(status, { statusCode: status, code, message });

export const CLASS_ID = "11111111-1111-4111-8111-111111111111";
export const ACTIVITY_ID = "22222222-2222-4222-8222-222222222222";
const SUBJECT = { id: "33333333-3333-4333-8333-333333333333", name: "Programação Orientada a Objetos" };
const ITEM_ID = "44444444-4444-4444-8444-444444444444";

export const schoolClass = (overrides: Partial<ClassView> = {}): ClassView => ({
  id: CLASS_ID,
  name: "POO Noturno",
  code: "POO-N",
  academicYear: 2026,
  period: null,
  description: null,
  status: "ACTIVE",
  activeStudentCount: 2,
  subject: SUBJECT,
  startsOn: "2026-02-02",
  endsOn: "2026-06-30",
  plannable: true,
  planStatus: "ACTIVE",
  createdAt: "2026-09-21T12:00:00.000Z",
  updatedAt: "2026-09-21T12:00:00.000Z",
  ...overrides,
});

export const WORK: WorkSummary = {
  id: "55555555-5555-4555-8555-555555555555",
  subject: SUBJECT,
  title: "Trabalho de herança",
  difficulty: null,
  totalGrade: "1.00",
  questionCount: 3,
  origin: "MANUAL",
  status: "APPROVED",
  topics: [],
  humanEdited: false,
  createdAt: "2026-09-21T12:00:00.000Z",
  updatedAt: "2026-09-21T12:00:00.000Z",
};

export const exercise = (index: number, statement: string): ExerciseTeacherView => ({
  id: `66666666-6666-4666-8666-66666666666${index}`,
  type: "MULTIPLE_CHOICE",
  statement,
  explanation: "Explicação",
  difficulty: "BASIC",
  cognitiveObjective: "UNDERSTAND",
  origin: "MANUAL",
  status: "APPROVED",
  archivedFromStatus: null,
  version: 1,
  expectedAnswer: null,
  instructions: null,
  starterCode: null,
  expectedSolution: null,
  language: null,
  alternatives: [
    { id: `77777777-7777-4777-8777-77777777777${index}`, position: 0, text: "Certa", isCorrect: true },
    { id: `88888888-8888-4888-8888-88888888888${index}`, position: 1, text: "Errada", isCorrect: false },
    { id: `99999999-9999-4999-8999-99999999999${index}`, position: 2, text: "Outra", isCorrect: false },
  ],
  isTrickQuestion: false,
  topic: null,
  humanReviewed: false,
  humanEdited: false,
  reviewedBy: null,
  reviewedAt: null,
  batchId: null,
  createdAt: "2026-09-21T12:00:00.000Z",
  updatedAt: "2026-09-21T12:00:00.000Z",
});

export const EXERCISES = [exercise(1, "O que é herança?"), exercise(2, "O que é polimorfismo?"), exercise(3, "O que é uma interface?")];

export const OUT_OF_SCOPE = { hasPlan: true, outOfScope: [{ syllabusItemId: ITEM_ID, title: "Polimorfismo", questionPositions: [1, 2] }] };

export const activity = (overrides: Partial<TeacherActivity> = {}): TeacherActivity => ({
  id: ACTIVITY_ID,
  type: "ASSIGNMENT",
  executionMode: "NORMAL",
  title: "Lista de herança",
  status: "ACTIVE",
  phase: "PUBLISHED",
  publishAt: "2026-10-01T12:00:00.000Z",
  deadline: "2026-10-10T23:59:00.000Z",
  latePolicy: "REJECT",
  totalGrade: "1.00",
  resultReleasedAt: null,
  counts: { enrolled: 30, inProgress: 4, submitted: 10, submittedLate: 2, missed: 0, pendingGrading: 3 },
  instructions: "Leia com atenção.",
  version: 2,
  outOfScopeTopicCount: 0,
  source: { workId: WORK.id },
  questions: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      position: 0,
      type: "MULTIPLE_CHOICE",
      gradingStrategy: "EXACT_MATCH",
      value: "1.00",
      statement: "Qual palavra declara herança?",
      instructions: null,
      starterCode: null,
      language: null,
      expectedAnswer: null,
      rubric: null,
      expectedSolution: null,
      explanation: "extends declara herança.",
      isTrickQuestion: false,
      alternatives: [
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", position: 0, text: "extends", isCorrect: true },
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", position: 1, text: "implements", isCorrect: false },
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3", position: 2, text: "inherits", isCorrect: false },
      ],
      testCases: [],
      topics: [{ syllabusItemId: ITEM_ID, title: "Herança" }],
    },
  ],
  roster: [
    {
      studentUserId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
      name: "Ana Souza",
      enrollment: "ACTIVE",
      status: "NOT_STARTED",
      attemptId: null,
      submittedAt: null,
      grade: null,
      gradePartial: null,
    },
  ],
  ...overrides,
});

export interface Call {
  method: string;
  url: string;
  body: unknown;
}

/**
 * A fetch that answers by method and URL: `routes` maps `"GET /api/…"` (exact, or a prefix ending
 * in `*`) to a response or a function of the body; every call is recorded.
 */
export function routedFetch(routes: Record<string, Response | ((body: unknown) => Response)>) {
  const calls: Call[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
    calls.push({ method, url, body });
    const key = `${method} ${url}`;
    const match =
      routes[key] ?? Object.entries(routes).find(([route]) => route.endsWith("*") && key.startsWith(route.slice(0, -1)))?.[1];
    if (!match) return apiError(404, "NOT_FOUND", "Não encontrado.");
    return typeof match === "function" ? match(body) : match.clone();
  };
  return { fetch, calls, writes: () => calls.filter((call) => call.method !== "GET") };
}

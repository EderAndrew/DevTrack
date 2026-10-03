import type { ClassView, ExerciseTeacherView, TeacherActivity, TeacherAttempt, WorkSummary } from "@repo/contracts";

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

export const exercise = (index: number, statement: string, difficulty: ExerciseTeacherView["difficulty"] = "BASIC"): ExerciseTeacherView => ({
  id: `66666666-6666-4666-8666-66666666666${index}`,
  type: "MULTIPLE_CHOICE",
  statement,
  explanation: "Explicação",
  difficulty,
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

/** One of each level (013/FR-002): 15 + 30 + 60 = 105 points. */
export const EXERCISES = [
  exercise(1, "O que é herança?", "BASIC"),
  exercise(2, "O que é polimorfismo?", "INTERMEDIATE"),
  exercise(3, "O que é uma interface?", "ADVANCED"),
];

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
  possiblePoints: null,
  resultReleasedAt: null,
  counts: { enrolled: 30, inProgress: 4, submitted: 10, submittedLate: 2, missed: 0, pendingGrading: 3 },
  exerciseCounts: null,
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
      difficulty: null,
      points: null,
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
      pointsEarned: null,
      pendingMarks: null,
    },
  ],
  ...overrides,
});

/**
 * An Exercício (013): no grade, deadline, late policy or release; three questions of each level, a
 * roster with one student who concluded (15 points, one answer waiting for a mark).
 */
export const exerciseActivity = (overrides: Partial<TeacherActivity> = {}): TeacherActivity => {
  const base = activity();
  const question = base.questions[0]!;
  const levels = [
    ["BASIC", 15],
    ["INTERMEDIATE", 30],
    ["ADVANCED", 60],
  ] as const;
  return activity({
    type: "EXERCISE",
    title: "Lista de prática",
    deadline: null,
    latePolicy: null,
    totalGrade: null,
    possiblePoints: 105,
    counts: { enrolled: 30, inProgress: 4, submitted: 0, submittedLate: 0, missed: 0, pendingGrading: 0 },
    exerciseCounts: { completed: 12, pendingMarks: 3 },
    source: { exerciseIds: EXERCISES.map((item) => item.id) },
    questions: levels.map(([difficulty, points], position) => ({
      ...question,
      id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab0${position}`,
      position,
      value: null,
      difficulty,
      points,
      statement: EXERCISES[position]!.statement,
      topics: [],
    })),
    roster: [
      { ...base.roster[0]!, pointsEarned: 0, pendingMarks: 0 },
      {
        studentUserId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
        name: "Bruno Lima",
        enrollment: "ACTIVE",
        status: "COMPLETED",
        attemptId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
        submittedAt: null,
        grade: null,
        gradePartial: null,
        pointsEarned: 15,
        pendingMarks: 1,
      },
    ],
    ...overrides,
  });
};

export const ATTEMPT_ID = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
export const OPEN_QUESTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";

/** A mixed work: the multiple choice of `activity()` (0,50) and an open answer (0,50). */
export const gradingActivity = (overrides: Partial<TeacherActivity> = {}): TeacherActivity => {
  const base = activity();
  const choice = { ...base.questions[0]!, value: "0.50" };
  return activity({
    questions: [
      choice,
      {
        ...choice,
        id: OPEN_QUESTION_ID,
        position: 1,
        type: "OPEN_ANSWER",
        gradingStrategy: "AI_REVIEW",
        statement: "Explique o encapsulamento.",
        expectedAnswer: "Esconder o estado atrás de métodos.",
        rubric: "Cita a interface pública.",
        explanation: null,
        alternatives: [],
      },
    ],
    roster: [
      { ...base.roster[0]!, studentUserId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc0", name: "Ana Souza", status: "NOT_STARTED" },
      {
        studentUserId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
        name: "Bruno Lima",
        enrollment: "ACTIVE",
        status: "SUBMITTED",
        attemptId: ATTEMPT_ID,
        submittedAt: "2026-10-05T12:00:00.000Z",
        grade: "0.50",
        gradePartial: true,
        pointsEarned: null,
        pendingMarks: null,
      },
      {
        studentUserId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc3",
        name: "Carla Dias",
        enrollment: "ACTIVE",
        status: "MISSED",
        attemptId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd3",
        submittedAt: null,
        grade: null,
        gradePartial: null,
        pointsEarned: null,
        pendingMarks: null,
      },
    ],
    ...overrides,
  });
};

/** Bruno's submission: the multiple choice right by the rule, the open answer pending. */
export const teacherAttempt = (overrides: Partial<TeacherAttempt> = {}): TeacherAttempt => ({
  id: ATTEMPT_ID,
  student: { userId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2", name: "Bruno Lima" },
  status: "SUBMITTED",
  startedAt: "2026-10-05T11:00:00.000Z",
  lastSavedAt: "2026-10-05T11:58:00.000Z",
  answers: [
    { questionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", answer: { kind: "ALTERNATIVE", alternativeId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1" }, savedAt: "2026-10-05T11:30:00.000Z" },
    { questionId: OPEN_QUESTION_ID, answer: { kind: "TEXT", text: "Proteger os atributos." }, savedAt: "2026-10-05T11:58:00.000Z" },
  ],
  submission: {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
    submittedAt: "2026-10-05T12:00:00.000Z",
    late: false,
    acceptedByTeacher: false,
    blankCount: 0,
    grade: "0.50",
    gradePartial: true,
    generalFeedback: null,
    version: 1,
    gradings: [
      { questionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", status: "GRADED", nature: "RULE_RESULT", finalGrade: "0.50", teacherGrade: null, pendingReason: null, feedback: null },
      { questionId: OPEN_QUESTION_ID, status: "PENDING_TEACHER", nature: null, finalGrade: null, teacherGrade: null, pendingReason: "AI_REVIEW_UNAVAILABLE", feedback: null },
    ],
  },
  exercise: null,
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

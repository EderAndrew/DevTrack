import type { StudentActivity, StudentActivitySummary, StudentDashboard, StudentExerciseAttempt, StudentQuestion } from "@repo/contracts";

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
export const apiError = (status: number, code: string, message: string) => json(status, { statusCode: status, code, message });

let sequence = 0;

/** A student activity summary as the API answers it (012 contracts/http-api.md): a Trabalho by default (013 left Exercício without grade or deadline). */
export const summary = (overrides: Partial<StudentActivitySummary> = {}): StudentActivitySummary => {
  sequence += 1;
  return {
    id: `aaaaaaaa-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    type: "ASSIGNMENT",
    executionMode: "NORMAL",
    aiHelp: { allowance: 0 },
    title: `Atividade ${sequence}`,
    summary: "Resolva os exercícios de herança.",
    class: { id: "11111111-1111-4111-8111-111111111111", name: "POO Noturno" },
    subjectName: "Programação Orientada a Objetos",
    teacherName: "Ana Professora",
    publishedAt: "2026-10-01T12:00:00.000Z",
    deadline: "2026-10-10T23:59:00.000Z",
    latePolicy: "REJECT",
    status: "PENDING",
    late: false,
    canAnswer: true,
    urgent: false,
    submittedAt: null,
    totalGrade: "1.00",
    result: null,
    points: null,
    ...overrides,
  };
};

export const dashboard = (overrides: Partial<StudentDashboard> = {}): StudentDashboard => ({
  firstName: "Bruna",
  counts: { pending: 3, inProgress: 2, overdue: 1, completed: 8 },
  next: [],
  overdueOpen: [],
  rankings: [],
  serverNow: "2026-10-02T12:00:00.000Z",
  ...overrides,
});

interface Call {
  method: string;
  url: string;
  /** The raw request body (a JSON string), when there is one. */
  body?: BodyInit | null;
}

/** `fetch` answering by "METHOD /api/path?query"; anything else is a 404. A function answers each call. */
export function routedFetch(routes: Record<string, Response | (() => Response | Promise<Response>)>) {
  const calls: Call[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const url = String(input);
    calls.push({ method, url, body: init?.body });
    const match = routes[`${method} ${url}`];
    if (!match) return apiError(404, "NOT_FOUND", "Não encontrado.");
    return typeof match === "function" ? match() : match.clone();
  };
  return { fetch, calls };
}

/** One activity as the student sees it, with three questions (one of each type) and no attempt. */
export const studentActivity = (overrides: Partial<StudentActivity> = {}): StudentActivity => {
  const { result: _result, ...base } = summary({ title: "Lista de herança", totalGrade: "1.00" });
  return {
    ...base,
    aiHelp: { allowance: 0, used: 0 },
    id: "bbbbbbbb-0000-4000-8000-000000000001",
    instructions: "Responda com suas palavras.",
    serverNow: "2026-10-02T12:00:00.000Z",
    questions: [
      {
        id: "cccccccc-0000-4000-8000-000000000001",
        position: 0,
        type: "OPEN_ANSWER",
        value: "0.40",
        points: null,
        statement: "Explique encapsulamento.",
        instructions: null,
        starterCode: null,
        language: null,
        publicTestCases: [],
        alternatives: [],
      },
      {
        id: "cccccccc-0000-4000-8000-000000000002",
        position: 1,
        type: "MULTIPLE_CHOICE",
        value: "0.30",
        points: null,
        statement: "O que é um objeto?",
        instructions: null,
        starterCode: null,
        language: null,
        publicTestCases: [],
        alternatives: [
          { id: "dddddddd-0000-4000-8000-000000000001", text: "Uma instância de uma classe." },
          { id: "dddddddd-0000-4000-8000-000000000002", text: "Um tipo primitivo." },
          { id: "dddddddd-0000-4000-8000-000000000003", text: "Um pacote." },
        ],
      },
      {
        id: "cccccccc-0000-4000-8000-000000000003",
        position: 2,
        type: "CODE",
        value: "0.30",
        points: null,
        statement: "Implemente a soma.",
        instructions: "Leia dois inteiros.",
        starterCode: "class Main {}",
        language: { name: "Java", highlight: "java" },
        publicTestCases: [{ input: "2 3", expectedOutput: "5" }],
        alternatives: [],
      },
    ],
    attempt: null,
    submission: null,
    result: null,
    completedAttempts: [],
    lastResult: null,
    pause: null,
    pauses: [],
    ...overrides,
  };
};

/**
 * An Exercício as the student sees it (013): no deadline, grade or late policy; the same three
 * questions worth 15, 30 and 60 points; no attempt.
 */
export const exerciseActivity = (overrides: Partial<StudentActivity> = {}): StudentActivity => {
  const base = studentActivity();
  const points = [15, 30, 60];
  return studentActivity({
    type: "EXERCISE",
    title: "Prática de herança",
    deadline: null,
    latePolicy: null,
    totalGrade: null,
    points: { possible: 105, earned: 0, awaitingCorrection: false },
    questions: base.questions.map((question, index) => ({ ...question, value: null, points: points[index]! })),
    ...overrides,
  });
};

/**
 * Attempt 1 concluded: the open answer waiting for the teacher, the multiple choice right (30), the
 * code blank; with the answer key, the explanation and a teacher's comment on the multiple choice.
 */
export const exerciseAttempt = (overrides: Partial<StudentExerciseAttempt> = {}): StudentExerciseAttempt => {
  const [open, choice, code] = studentActivity().questions as [StudentQuestion, StudentQuestion, StudentQuestion];
  return {
    number: 1,
    completedAt: "2026-10-03T14:05:00.000Z",
    first: true,
    pointsEarned: 30,
    questions: [
      {
        questionId: open.id,
        position: 0,
        answer: { kind: "TEXT", text: "Esconder o estado." },
        result: "PENDING_TEACHER",
        points: 0,
        alreadyScored: false,
        correctAlternativeId: null,
        expectedAnswer: "Proteger o estado atrás de métodos.",
        expectedSolution: null,
        explanation: "Encapsular é esconder detalhes.",
        teacherComment: null,
      },
      {
        questionId: choice.id,
        position: 1,
        answer: { kind: "ALTERNATIVE", alternativeId: choice.alternatives[0]!.id },
        result: "CORRECT",
        points: 30,
        alreadyScored: false,
        correctAlternativeId: choice.alternatives[0]!.id,
        expectedAnswer: null,
        expectedSolution: null,
        explanation: "Um objeto é uma instância.",
        teacherComment: "Muito bem.",
      },
      {
        questionId: code.id,
        position: 2,
        answer: null,
        result: "WRONG",
        points: 0,
        alreadyScored: false,
        correctAlternativeId: null,
        expectedAnswer: null,
        expectedSolution: "class Soma {}",
        explanation: "Some os dois.",
        teacherComment: null,
      },
    ],
    ...overrides,
  };
};

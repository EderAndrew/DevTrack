import type { StudentActivitySummary, StudentDashboard } from "@repo/contracts";

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
export const apiError = (status: number, code: string, message: string) => json(status, { statusCode: status, code, message });

let sequence = 0;

/** A student activity summary as the API answers it (012 contracts/http-api.md). */
export const summary = (overrides: Partial<StudentActivitySummary> = {}): StudentActivitySummary => {
  sequence += 1;
  return {
    id: `aaaaaaaa-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    type: "EXERCISE",
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
    ...overrides,
  };
};

export const dashboard = (overrides: Partial<StudentDashboard> = {}): StudentDashboard => ({
  firstName: "Bruna",
  counts: { pending: 3, inProgress: 2, overdue: 1, completed: 8 },
  next: [],
  overdueOpen: [],
  serverNow: "2026-10-02T12:00:00.000Z",
  ...overrides,
});

interface Call {
  method: string;
  url: string;
}

/** `fetch` answering by "METHOD /api/path?query"; anything else is a 404. A function answers each call. */
export function routedFetch(routes: Record<string, Response | (() => Response | Promise<Response>)>) {
  const calls: Call[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const url = String(input);
    calls.push({ method, url });
    const match = routes[`${method} ${url}`];
    if (!match) return apiError(404, "NOT_FOUND", "Não encontrado.");
    return typeof match === "function" ? match() : match.clone();
  };
  return { fetch, calls };
}

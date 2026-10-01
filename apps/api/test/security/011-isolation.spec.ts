import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api } from "../helpers/test-app";
import { createWorkAiApp, workGenerationRequest } from "../helpers/work-ai";
import { type ConfirmedSyllabus, createConfirmedSyllabus, createWork, createWorkGenerationRequest } from "../helpers/works";

const NOT_FOUND = { statusCode: 404, code: "NOT_FOUND", message: expect.any(String) };

interface Area {
  teacher: TestUser;
  cookie: string;
  syllabus: ConfirmedSyllabus;
  /** MANUAL, APPROVED, on the first topic. */
  approvedId: string;
  /** MANUAL, ARCHIVED. */
  archivedId: string;
  /** AI_GENERATED DRAFT of `requestId`. */
  draftId: string;
  requestId: string;
}

async function area(t: AiTestApp, name: string, roles: ("TEACHER" | "ADMIN")[] = ["TEACHER"]): Promise<Area> {
  const teacher = await createUser(t, { roles, name: `Professor ${name}` });
  const syllabus = await createConfirmedSyllabus(t, teacher.id);
  const approved = await createWork(t, teacher.id, { syllabus, title: `Trabalho de ${name}` });
  const archived = await createWork(t, teacher.id, { status: "ARCHIVED", title: `Arquivado de ${name}` });
  const request = await createWorkGenerationRequest(t, teacher.id, syllabus, { generatedAt: new Date() });
  const draft = await createWork(t, teacher.id, {
    syllabus,
    origin: "AI_GENERATED",
    status: "DRAFT",
    title: `Gerado de ${name}`,
    generationRequestId: request.id,
  });
  return { teacher, cookie: await loginAs(t, teacher), syllabus, approvedId: approved.id, archivedId: archived.id, draftId: draft.id, requestId: request.id };
}

/** A valid manual work on `subjectId`, with `topics` of some revision (what the check looks at). */
const manualWork = (subjectId: string, topics: { syllabusRevisionId: string; syllabusItemIds: string[] } | null = null) => ({
  subjectId,
  title: "Trabalho",
  totalGrade: "1.00",
  topics,
  questions: [{ type: "OPEN_ANSWER", statement: "Pergunta", expectedAnswer: "Resposta" }],
  status: "DRAFT",
});
const topicsOf = (syllabus: ConfirmedSyllabus) => ({ syllabusRevisionId: syllabus.revision.id, syllabusItemIds: [syllabus.itemIds[0]!] });
const editBody = (topics: ReturnType<typeof topicsOf> | null = null) => {
  const { title, totalGrade, questions } = manualWork("", topics);
  return { title, totalGrade, topics, questions, version: 1 };
};

/** Everything a refused call must leave as it was. */
async function snapshot(t: AiTestApp) {
  return {
    works: await t.prisma.work.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, version: true, title: true, updatedAt: true } }),
    requests: await t.prisma.workGenerationRequest.count(),
    audit: await t.prisma.auditEvent.count({ where: { type: { startsWith: "work" } } }),
    executions: await t.prisma.aiExecution.count(),
  };
}

/**
 * 011/US7-4 011/SC-008: each teacher's work bank is closed to the other. With A's session over B's
 * ids every work and request route answers 404 (never 403, which would reveal the id), and B's
 * subject and topics are 404 in a create, an edit or a generation request. ADMIN, MANAGER and
 * STUDENT hold none of the permissions: 403 on every route, before any lookup. A user who is ADMIN
 * and TEACHER sees only their own bank, as a teacher.
 */
describe("011/US7-4 011/SC-008 isolamento do banco de trabalhos", () => {
  let t: AiTestApp;
  let a: Area;
  let b: Area;

  beforeAll(async () => {
    t = await createWorkAiApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetAiDb(t);
    a = await area(t, "A");
    b = await area(t, "B");
  });

  it("com a sessão de A, toda rota sobre ids de B responde 404 e nada muda", async () => {
    const client = api(t, { cookie: a.cookie });
    const before = await snapshot(t);
    const calls = [
      ["GET trabalho", () => client.get(`/api/works/${b.approvedId}`)],
      ["ver como aluno", () => client.get(`/api/works/${b.approvedId}/student-preview`)],
      ["editar", () => client.put(`/api/works/${b.approvedId}`, editBody())],
      ["aprovar", () => client.post(`/api/works/${b.draftId}/approve`, { version: 1 })],
      ["arquivar", () => client.post(`/api/works/${b.approvedId}/archive`, { version: 1 })],
      ["restaurar", () => client.post(`/api/works/${b.archivedId}/restore`, { version: 1 })],
      ["GET pedido", () => client.get(`/api/work-generation-requests/${b.requestId}`)],
      ["criar na disciplina de B", () => client.post("/api/works", manualWork(b.syllabus.subject.id))],
      ["criar com tópicos de B", () => client.post("/api/works", manualWork(a.syllabus.subject.id, topicsOf(b.syllabus)))],
      ["editar o próprio com tópicos de B", () => client.put(`/api/works/${a.approvedId}`, editBody(topicsOf(b.syllabus)))],
      ["gerar nos tópicos de B", () => client.post("/api/work-generation-requests", workGenerationRequest(b.syllabus))],
      [
        "gerar de novo a partir de um pedido de B",
        () => client.post("/api/work-generation-requests", workGenerationRequest(a.syllabus, { regeneratedFromId: b.requestId })),
      ],
    ] as const;
    for (const [name, call] of calls) {
      const res = await call();
      expect({ name, status: res.status, body: res.body }).toEqual({ name, status: 404, body: NOT_FOUND });
    }
    expect(await snapshot(t)).toEqual(before);

    // The lists carry only A's own, whatever the filter names.
    const works = await client.get("/api/works");
    expect(works.body.items.map((item: { id: string }) => item.id).sort()).toEqual([a.approvedId, a.draftId].sort());
    expect((await client.get("/api/works?status=ARCHIVED")).body.items.map((item: { id: string }) => item.id)).toEqual([a.archivedId]);
    expect((await client.get(`/api/works?subjectId=${b.syllabus.subject.id}`)).body.items).toEqual([]);
    expect((await client.get(`/api/works?syllabusItemId=${b.syllabus.itemIds[0]}`)).body.items).toEqual([]);
    expect((await client.get("/api/work-generation-requests")).body.items.map((item: { id: string }) => item.id)).toEqual([a.requestId]);
  });

  it("ADMIN, MANAGER e ALUNO recebem 403 em toda rota do banco, antes de qualquer busca", async () => {
    const admin = await createUser(t, { roles: ["ADMIN"] });
    const manager = await createUser(t, { roles: ["MANAGER"] });
    const student = await createUser(t, { roles: ["STUDENT"] });
    const before = await snapshot(t);
    for (const user of [admin, manager, student]) {
      const client = api(t, { cookie: await loginAs(t, user) });
      const answers = [
        await client.get("/api/works"),
        await client.get(`/api/works/${a.approvedId}`),
        await client.get(`/api/works/${a.approvedId}/student-preview`),
        await client.get("/api/works/programming-languages"),
        await client.post("/api/works", manualWork(a.syllabus.subject.id)),
        await client.put(`/api/works/${a.approvedId}`, editBody()),
        await client.post(`/api/works/${a.draftId}/approve`, { version: 1 }),
        await client.post(`/api/works/${a.approvedId}/archive`, { version: 1 }),
        await client.post(`/api/works/${a.archivedId}/restore`, { version: 1 }),
        await client.get("/api/work-generation/availability"),
        await client.post("/api/work-generation-requests", workGenerationRequest(a.syllabus)),
        await client.get("/api/work-generation-requests"),
        await client.get(`/api/work-generation-requests/${a.requestId}`),
      ];
      expect(answers.map((res) => res.status)).toEqual(answers.map(() => 403));
    }
    expect(await snapshot(t)).toEqual(before);
  });

  it("uma conta ADMIN e TEACHER vê só o próprio banco, como professora", async () => {
    const both = await area(t, "C", ["ADMIN", "TEACHER"]);
    const client = api(t, { cookie: both.cookie });
    expect((await client.get("/api/works")).body.items.map((item: { id: string }) => item.id).sort()).toEqual([both.approvedId, both.draftId].sort());
    expect((await client.get(`/api/works/${a.approvedId}`)).status).toBe(404);
    expect((await client.post(`/api/works/${a.approvedId}/archive`, { version: 1 })).status).toBe(404);
  });
});

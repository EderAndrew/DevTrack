import type { WorkSummary, WorkTeacherView } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { searchKey } from "../../src/platform/text/search-key";
import { validGeneratedWork } from "../fixtures/work-generation/valid-work";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, testConfig } from "../helpers/test-app";
import { createWorkAiApp, requestWork, scriptWorkGeneration, workGenerationRequest } from "../helpers/work-ai";
import { type ConfirmedSyllabus, createConfirmedSyllabus, createWork, createWorkGenerationRequest, toUpdateBody } from "../helpers/works";

/**
 * 011/US7 — the teacher's bank: every filter (subject, syllabus, topic, origin, status, difficulty,
 * creation period and a title search that ignores case and accents), keyset pages of at most 50,
 * ARCHIVED only when asked, archive and restore to the previous status, and no limit on how many
 * works a teacher keeps (011/FR-031, research W19).
 */

const config = { rateLimit: { ...testConfig().rateLimit, aiExecutionsPerMinute: 100, aiAgentPerHour: 100, workAiPerHour: 100 } };

/** Inserts `count` MANUAL works of one open answer worth the whole grade, in one transaction (the deferred triggers run at commit). */
async function bulkWorks(t: AiTestApp, teacherId: string, subjectId: string, count: number, title = (i: number) => `Trabalho em lote ${i}`) {
  const base = Date.parse("2026-09-01T00:00:00.000Z");
  await t.prisma.runInTransaction(async (tx) => {
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1) ids.push(crypto.randomUUID());
    await tx.work.createMany({
      data: ids.map((id, i) => ({
        id,
        teacherId,
        subjectId,
        title: title(i),
        titleSearchKey: searchKey(title(i)),
        totalGrade: "1.00",
        questionCount: 1,
        origin: "MANUAL" as const,
        status: "DRAFT" as const,
        updatedAt: new Date(base + i * 1000),
      })),
    });
    await tx.workQuestion.createMany({
      data: ids.map((workId) => ({
        workId,
        position: 0,
        type: "OPEN_ANSWER" as const,
        gradingStrategy: "AI_REVIEW" as const,
        statement: "Enunciado",
        statementSearchKey: "enunciado",
        value: "1.00",
        expectedAnswer: "Resposta",
      })),
    });
  });
}

describe("011/US7 consultar e manter o Banco de Trabalhos", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let cookie: string;
  let client: ReturnType<typeof api>;
  let poo: ConfirmedSyllabus;
  let other: ConfirmedSyllabus;

  beforeAll(async () => {
    t = await createWorkAiApp({ config });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    client = api(t, { cookie });
    poo = await createConfirmedSyllabus(t, teacher.id);
    other = await createConfirmedSyllabus(t, teacher.id, { title: "Estruturas de dados" });
  });

  const ids = (res: { body: { items: { id: string }[] } }) => res.body.items.map((item) => item.id).sort();
  const list = (query = "") => client.get(`/api/works${query ? `?${query}` : ""}`);
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });

  describe("011/US7-1 011/FR-031 filtros, sozinhos e combinados", () => {
    let heranca: string;
    let colecoes: string;
    let listas: string;
    let arquivado: string;
    let gerado: string;

    beforeEach(async () => {
      heranca = (await createWork(t, teacher.id, { syllabus: poo, topicItemIds: [poo.itemIds[0]!], title: "Herança e polimorfismo", status: "DRAFT", difficulty: "BASIC" })).id;
      colecoes = (await createWork(t, teacher.id, { syllabus: poo, topicItemIds: [poo.itemIds[3]!], title: "Coleções", status: "APPROVED", difficulty: "ADVANCED" })).id;
      listas = (await createWork(t, teacher.id, { subjectId: other.subject.id, title: "Listas encadeadas", status: "APPROVED" })).id;
      arquivado = (await createWork(t, teacher.id, { syllabus: poo, topicItemIds: [poo.itemIds[0]!], title: "Herança arquivada", status: "ARCHIVED" })).id;
      const request = await createWorkGenerationRequest(t, teacher.id, poo, { generatedAt: new Date() });
      gerado = (
        await createWork(t, teacher.id, { syllabus: poo, topicItemIds: [poo.itemIds[0]!], title: "Gerado", status: "DRAFT", origin: "AI_GENERATED", generationRequestId: request.id })
      ).id;
      await t.prisma.work.update({ where: { id: listas }, data: { createdAt: new Date("2026-01-10T15:00:00.000Z") } });
    });

    it("sem filtro: DRAFT e APPROVED do professor; arquivados só quando pedidos", async () => {
      expect(ids(await list())).toEqual([heranca, colecoes, listas, gerado].sort());
      expect(ids(await list("status=ARCHIVED"))).toEqual([arquivado]);
      expect(ids(await list("status=DRAFT"))).toEqual([heranca, gerado].sort());
      expect(ids(await list("status=APPROVED"))).toEqual([colecoes, listas].sort());
    });

    it.each<[string, () => string, () => string[]]>([
      ["disciplina", () => `subjectId=${other.subject.id}`, () => [listas]],
      ["ementa", () => `syllabusRevisionId=${poo.revision.id}`, () => [heranca, colecoes, gerado]],
      ["tópico", () => `syllabusItemId=${poo.itemIds[0]}`, () => [heranca, gerado]],
      ["origem", () => "origin=AI_GENERATED", () => [gerado]],
      ["origem manual", () => "origin=MANUAL", () => [heranca, colecoes, listas]],
      ["dificuldade", () => "difficulty=ADVANCED", () => [colecoes]],
      ["período de um dia", () => "createdFrom=2026-01-10&createdTo=2026-01-10", () => [listas]],
      ["período antes de tudo", () => "createdTo=2026-01-09", () => []],
      ["tópico e situação", () => `syllabusItemId=${poo.itemIds[0]}&status=DRAFT&origin=MANUAL`, () => [heranca]],
      ["tópico arquivado", () => `syllabusItemId=${poo.itemIds[0]}&status=ARCHIVED`, () => [arquivado]],
      ["disciplina e busca", () => `subjectId=${poo.subject.id}&query=colecoes`, () => [colecoes]],
    ])("%s", async (_, query, expected) => {
      const res = await list(query());
      expect(res.status).toBe(200);
      expect(ids(res)).toEqual(expected().sort());
    });

    it("011/US7-2 \"heranca\" encontra \"Herança\" (maiúsculas e acentos ignorados); % e _ são texto", async () => {
      expect(ids(await list("query=heranca"))).toEqual([heranca]);
      expect(ids(await list("query=HERANÇA%20E"))).toEqual([heranca]);
      expect(ids(await list("query=heranca&status=ARCHIVED"))).toEqual([arquivado]);
      expect(ids(await list("query=%25"))).toEqual([]);
    });

    it("o resumo traz disciplina, tópicos, nota, origem, situação e edição por pessoa, sem as questões", async () => {
      const res = await list(`syllabusItemId=${poo.itemIds[0]}&origin=MANUAL`);
      const [item] = res.body.items as WorkSummary[];
      expect(item).toEqual({
        id: heranca,
        subject: { id: poo.subject.id, name: poo.subject.name },
        title: "Herança e polimorfismo",
        difficulty: "BASIC",
        totalGrade: "1.00",
        questionCount: 1,
        // 021 (research Y2): no CODE question the Code Runner can run.
        runnableCodeQuestionCount: 0,
        origin: "MANUAL",
        status: "DRAFT",
        topics: [{ syllabusItemId: poo.itemIds[0], itemText: "Herança" }],
        humanEdited: false,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it("ids desconhecidos não encontram nada; filtro malformado → 400", async () => {
      expect(ids(await list(`subjectId=${crypto.randomUUID()}`))).toEqual([]);
      expect((await list("status=PUBLISHED")).status).toBe(400);
      expect((await list("createdFrom=10/01/2026")).status).toBe(400);
      expect((await list("teacherId=x")).status).toBe(400);
    });
  });

  it("011/US7-1 páginas por cursor sem repetição nem buraco, na ordem da última alteração; página ≤ 50", async () => {
    await bulkWorks(t, teacher.id, poo.subject.id, 45);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await list(`pageSize=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeLessThanOrEqual(20);
      seen.push(...res.body.items.map((item: WorkSummary) => item.title));
      cursor = res.body.nextCursor;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toEqual(Array.from({ length: 45 }, (_, i) => `Trabalho em lote ${44 - i}`));
    expect((await list()).body.items).toHaveLength(20);
    expect((await list("pageSize=50")).body.items).toHaveLength(45);
    expect((await list("pageSize=51")).status).toBe(400);
    expect((await list("cursor=nao-e-cursor")).status).toBe(400);
  });

  describe("011/US7-3 arquivar e restaurar", () => {
    const view = async (id: string) => (await client.get(`/api/works/${id}`)).body as WorkTeacherView;
    const archive = (work: Pick<WorkTeacherView, "id" | "version">) => client.post(`/api/works/${work.id}/archive`, { version: work.version });
    const restore = (work: Pick<WorkTeacherView, "id" | "version">) => client.post(`/api/works/${work.id}/restore`, { version: work.version });

    it.each(["DRAFT", "APPROVED"] as const)("%s → ARCHIVED, sai da consulta padrão, não edita nem aprova, e volta a %s", async (status) => {
      const work = await view((await createWork(t, teacher.id, { status, title: `Trabalho ${status}` })).id);
      const archived = await archive(work);
      expect(archived.status).toBe(200);
      expect(archived.body).toMatchObject({ status: "ARCHIVED", archivedFromStatus: status, version: work.version + 1 });
      expect((await events("work.archived")).map((event) => event.metadata)).toEqual([{ from: status }]);
      expect(ids(await list())).toEqual([]);
      expect(ids(await list("status=ARCHIVED"))).toEqual([work.id]);

      expect((await client.put(`/api/works/${work.id}`, { ...toUpdateBody(archived.body), title: "Outro" })).body.code).toBe("INVALID_STATE_TRANSITION");
      expect((await client.post(`/api/works/${work.id}/approve`, { version: archived.body.version })).status).toBe(409);

      const again = await archive(archived.body);
      expect(again.status).toBe(200);
      expect(again.body.version).toBe(archived.body.version);
      expect(await events("work.archived")).toHaveLength(1);

      const restored = await restore(archived.body);
      expect(restored.status).toBe(200);
      expect(restored.body).toMatchObject({ status, archivedFromStatus: null, version: archived.body.version + 1 });
      expect((await events("work.restored")).map((event) => event.metadata)).toEqual([{ to: status }]);
      expect(ids(await list())).toEqual([work.id]);
    });

    it("restaurar o que não está arquivado → 409; versão antiga → 409 WORK_VERSION_CONFLICT", async () => {
      const work = await view((await createWork(t, teacher.id, { status: "DRAFT" })).id);
      const refused = await restore(work);
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe("INVALID_STATE_TRANSITION");
      await archive(work);
      const stale = await archive(work);
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe("WORK_VERSION_CONFLICT");
    });

    it("arquivar um trabalho gerado nunca aprovado fecha a proposta REJECT; restaurar não a reabre", async () => {
      const res = await requestWork(t, cookie, workGenerationRequest(poo));
      scriptWorkGeneration(
        t.provider,
        res.body.id,
        validGeneratedWork({ difficulty: "INTERMEDIATE", counts: { OPEN_ANSWER: 3, MULTIPLE_CHOICE: 0, CODE: 0 }, trickQuestions: 0, language: null, topicCount: 1 }),
      );
      await drain(t);
      const workId = (await client.get(`/api/work-generation-requests/${res.body.id}`)).body.workId as string;
      expect((await t.prisma.aiProposal.findFirstOrThrow()).status).toBe("READY_FOR_REVIEW");
      const archived = await archive(await view(workId));
      expect(archived.status).toBe(200);
      expect(await t.prisma.aiProposal.findFirstOrThrow()).toMatchObject({ status: "REJECTED", decidedByUserId: teacher.id });
      const restored = await restore(archived.body);
      expect(restored.body.status).toBe("DRAFT");
      expect((await t.prisma.aiProposal.findFirstOrThrow()).status).toBe("REJECTED");
    });
  });

  it("011/US7-5 500 trabalhos numa disciplina e mais um é aceito: não há limite", async () => {
    await bulkWorks(t, teacher.id, poo.subject.id, 500);
    const res = await client.post("/api/works", {
      subjectId: poo.subject.id,
      title: "O de número 501",
      totalGrade: "1.00",
      topics: null,
      questions: [{ type: "OPEN_ANSWER", statement: "Pergunta", expectedAnswer: "Resposta" }],
      status: "DRAFT",
    });
    expect(res.status).toBe(201);
    expect(await t.prisma.work.count({ where: { subjectId: poo.subject.id } })).toBe(501);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { searchKey } from "../../src/platform/text/search-key";
import { createUser, loginAs } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { type ConfirmedSyllabus, createConfirmedSyllabus } from "../helpers/works";

const WORKS = 1000;
const LIMIT_MS = 1000;

/**
 * 011/SC-009: the bank of a teacher with 1 000 works answers its first filtered page within 1 s,
 * and no answer carries more than a page. Each query is warmed once, then the slowest of three
 * calls is measured end to end through HTTP (same pattern as 010).
 */
describe("011/SC-009 — consulta ao banco com 1 000 trabalhos em até 1 s", () => {
  let t: TestApp;
  let client: ReturnType<typeof api>;
  let syllabus: ConfirmedSyllabus;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    syllabus = await createConfirmedSyllabus(t, teacher.id);
    const base = Date.parse("2026-09-01T00:00:00.000Z");
    const ids = Array.from({ length: WORKS }, () => crypto.randomUUID());
    const withTopic = (i: number) => i % 2 === 0;
    // One transaction: the deferred triggers check each work's questions and topics at commit.
    await t.prisma.runInTransaction(async (tx) => {
      await tx.work.createMany({
        data: ids.map((id, i) => {
          const title = i % 10 === 0 ? `Herança número ${i}` : `Trabalho número ${i}`;
          return {
            id,
            teacherId: teacher.id,
            subjectId: syllabus.subject.id,
            syllabusRevisionId: withTopic(i) ? syllabus.revision.id : null,
            title,
            titleSearchKey: searchKey(title),
            difficulty: (["BASIC", "INTERMEDIATE", "ADVANCED"] as const)[i % 3]!,
            totalGrade: "1.00",
            questionCount: 1,
            origin: "MANUAL" as const,
            status: i % 7 === 0 ? ("ARCHIVED" as const) : i % 2 === 0 ? ("DRAFT" as const) : ("APPROVED" as const),
            archivedFromStatus: i % 7 === 0 ? ("APPROVED" as const) : null,
            createdAt: new Date(base + i * 60_000),
            updatedAt: new Date(base + i * 1000),
          };
        }),
      });
      await tx.workTopic.createMany({
        data: ids.flatMap((workId, i) =>
          withTopic(i) ? [{ workId, syllabusItemId: syllabus.itemIds[i % syllabus.itemIds.length]!, syllabusRevisionId: syllabus.revision.id, position: 0 }] : [],
        ),
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
    client = api(t, { cookie: await loginAs(t, teacher) });
  }, 120_000);
  afterAll(() => t.close());

  const slowest = async (call: () => Promise<{ status: number; body: { items: unknown[] } }>) => {
    const warm = await call();
    expect(warm.status).toBe(200);
    let worst = 0;
    for (let i = 0; i < 3; i += 1) {
      const start = performance.now();
      const res = await call();
      worst = Math.max(worst, performance.now() - start);
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeLessThanOrEqual(50);
    }
    return worst;
  };

  it.each([
    ["página padrão", () => client.get("/api/works")],
    ["página máxima", () => client.get("/api/works?pageSize=50")],
    ["busca sem acento", () => client.get("/api/works?query=heranca&pageSize=50")],
    ["tópico", () => client.get(`/api/works?syllabusItemId=${syllabus.itemIds[0]}&pageSize=50`)],
    ["filtros combinados", () => client.get(`/api/works?subjectId=${syllabus.subject.id}&difficulty=BASIC&status=DRAFT&createdFrom=2026-09-01&pageSize=50`)],
    ["arquivados", () => client.get("/api/works?status=ARCHIVED&pageSize=50")],
  ] as const)("%s ≤ 1 s", async (_name, call) => {
    expect(await slowest(call)).toBeLessThanOrEqual(LIMIT_MS);
  });
});

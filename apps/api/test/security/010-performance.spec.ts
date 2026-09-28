import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { searchKey } from "../../src/platform/text/search-key";
import { type ConfirmedTopic, createConfirmedTopic } from "../helpers/exercises";
import { createUser, loginAs } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const EXERCISES = 1000;
const LIMIT_MS = 1000;

/**
 * 010/SC-008: the bank of a teacher with 1 000 exercises answers its first filtered page within
 * 1 s, and no answer carries more than a page. Each query is warmed once, then the slowest of
 * three calls is measured end to end through HTTP (same pattern as 003/004).
 */
describe("010/SC-008 — consulta ao banco com 1 000 exercícios em até 1 s", () => {
  let t: TestApp;
  let client: ReturnType<typeof api>;
  let topic: ConfirmedTopic;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    topic = await createConfirmedTopic(t, teacher.id);
    // Open answers need no alternatives, so the bulk insert passes the deferred trigger.
    const base = Date.parse("2026-09-01T00:00:00.000Z");
    await t.prisma.exercise.createMany({
      data: Array.from({ length: EXERCISES }, (_, i) => {
        const statement = i % 10 === 0 ? `Herança número ${i}` : `Enunciado número ${i}`;
        return {
          teacherId: teacher.id,
          type: "OPEN_ANSWER" as const,
          difficulty: (["BASIC", "INTERMEDIATE", "ADVANCED"] as const)[i % 3]!,
          cognitiveObjective: "UNDERSTAND" as const,
          origin: "MANUAL" as const,
          status: i % 7 === 0 ? ("ARCHIVED" as const) : i % 2 === 0 ? ("DRAFT" as const) : ("APPROVED" as const),
          archivedFromStatus: i % 7 === 0 ? ("APPROVED" as const) : null,
          statement,
          statementSearchKey: searchKey(statement),
          explanation: "Explicação",
          expectedAnswer: "Resposta",
          syllabusItemId: i % 2 === 0 ? topic.itemId : null,
          updatedAt: new Date(base + i * 1000),
        };
      }),
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
    ["página padrão", () => client.get("/api/exercises")],
    ["página máxima", () => client.get("/api/exercises?pageSize=50")],
    ["busca sem acento", () => client.get("/api/exercises?query=heranca&pageSize=50")],
    ["filtros combinados", () => client.get(`/api/exercises?subjectId=${topic.subject.id}&difficulty=BASIC&type=OPEN_ANSWER&pageSize=50`)],
    ["arquivados", () => client.get("/api/exercises?status=ARCHIVED&pageSize=50")],
  ] as const)("%s ≤ 1 s", async (_name, call) => {
    expect(await slowest(call)).toBeLessThanOrEqual(LIMIT_MS);
  });
});

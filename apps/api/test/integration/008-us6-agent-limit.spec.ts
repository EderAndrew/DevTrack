import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RateLimitService } from "../../src/platform/rate-limit/rate-limit.service";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { createCurriculumAiApp, requestAnalysis, seedProcessedDocument } from "../helpers/curriculum-ai";
import { createUser, loginAs } from "../helpers/factories";
import { testConfig } from "../helpers/test-app";

const PER_HOUR = 3;

describe("008/US6 limite global por agente (research G9)", () => {
  let t: AiTestApp;

  beforeAll(async () => {
    const base = testConfig();
    t = await createCurriculumAiApp({ config: { rateLimit: { ...base.rateLimit, aiAgentPerHour: PER_HOUR } } });
  });
  afterAll(() => t.close());

  beforeEach(() => resetAiDb(t));

  const teacherWithDocument = async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const cookie = await loginAs(t, teacher);
    const { document } = await seedProcessedDocument(t, teacher.id);
    return { teacher, cookie, document };
  };
  const agentCount = async () => (await t.get(RateLimitService).peek("ai-agent", "curriculum-agent", PER_HOUR)).count;

  it("008/US6-3 professores diferentes esgotam o limite do agente; o seguinte recebe 429 com Retry-After, sem execução, auditado com scope agent", async () => {
    for (let i = 0; i < PER_HOUR; i += 1) {
      const { cookie, document } = await teacherWithDocument();
      expect((await requestAnalysis(t, cookie, document.id)).status).toBe(202);
    }
    const { teacher, cookie, document } = await teacherWithDocument();
    const res = await requestAnalysis(t, cookie, document.id);

    expect(res.status).toBe(429);
    expect(res.body.code).toBe("RATE_LIMITED");
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    expect(await t.prisma.aiExecution.count()).toBe(PER_HOUR);
    expect(await t.prisma.aiExecution.count({ where: { requestedByUserId: teacher.id } })).toBe(0);
    // No trace of the refused request but the rate-limit event.
    expect(await t.prisma.auditEvent.count({ where: { type: "curriculum_ai.analysis_requested", actorUserId: teacher.id } })).toBe(0);
    const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_execution.rate_limited", actorUserId: teacher.id } });
    expect(event).toMatchObject({ actorType: "USER", metadata: { scope: "agent" } });
  });

  it("008/US6-4 pedidos repetidos e simultâneos do mesmo professor para o mesmo documento → uma execução, contada uma vez", async () => {
    const { cookie, document } = await teacherWithDocument();
    const burst = await Promise.all([1, 2, 3, 4].map(() => requestAnalysis(t, cookie, document.id)));
    expect(burst.map((res) => res.status).sort()).toEqual([200, 200, 200, 202]);
    expect((await requestAnalysis(t, cookie, document.id)).status).toBe(200);
    expect(await t.prisma.aiExecution.count()).toBe(1);
    expect(await agentCount()).toBe(1);

    // The rest of the hour is still there for others.
    for (let i = 1; i < PER_HOUR; i += 1) {
      const other = await teacherWithDocument();
      expect((await requestAnalysis(t, other.cookie, other.document.id)).status).toBe(202);
    }
    expect(await agentCount()).toBe(PER_HOUR);
  });
});

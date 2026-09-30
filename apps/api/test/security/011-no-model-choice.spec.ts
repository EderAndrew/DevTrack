import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { createUser, loginAs } from "../helpers/factories";
import { testConfig } from "../helpers/test-app";
import { createWorkAiApp, requestWork, workGenerationRequest } from "../helpers/work-ai";
import { createConfirmedSyllabus } from "../helpers/works";

/**
 * 011/FR-009, 011/SC-010, research W8: the work's pedagogical difficulty never chooses the model.
 * The source scan of `works`/`work-ai` lives in `test/works-boundary.spec.ts`; here the 009 policy
 * routes the three difficulties and the request records nothing about models.
 */
describe("011/US3-7 011/SC-010 a dificuldade do trabalho nunca escolhe o modelo", () => {
  let t: AiTestApp;

  beforeAll(async () => {
    t = await createWorkAiApp({ config: { rateLimit: { ...testConfig().rateLimit, aiExecutionsPerMinute: 100, aiAgentPerHour: 100, workAiPerHour: 100 } } });
    await resetAiDb(t);
  });
  afterAll(() => t.close());

  it("Básico, Intermediário e Avançado → a mesma tarefa, o mesmo nível, a mesma configuração e o mesmo modelo", async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const cookie = await loginAs(t, teacher);
    const syllabus = await createConfirmedSyllabus(t, teacher.id);
    for (const difficulty of ["BASIC", "INTERMEDIATE", "ADVANCED"] as const) {
      expect((await requestWork(t, cookie, workGenerationRequest(syllabus, { difficulty }))).status).toBe(202);
    }
    const executions = await t.prisma.aiExecution.findMany({ select: { taskKey: true, tier: true, modelConfigId: true, model: true, selectionReason: true } });
    expect(executions).toHaveLength(3);
    expect(new Set(executions.map((execution) => JSON.stringify(execution))).size).toBe(1);
    expect(executions[0]!.taskKey).toBe("work-generation");
  });

  it("011/FR-009 o pedido registrado não guarda campo de modelo, provedor, família, nível ou tarefa", async () => {
    const columns = await t.prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name IN ('work_generation_requests', 'work_generation_request_topics', 'works')`;
    const forbidden = columns.map((row) => row.column_name).filter((name) => /model|provider|family|tier|task/i.test(name));
    expect(forbidden).toEqual([]);
  });
});

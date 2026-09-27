import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiExecutionWorker } from "../../src/modules/ai/execution/ai-execution.worker";
import { AiRegistrySync } from "../../src/modules/ai/registry/ai-registry.sync";
import { fakeDelay, fakeOutput } from "../fixtures/ai/fake-model-provider";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { createCurriculumAiApp, getCurriculumAiStatus, pooOutput, requestAnalysis, seedProcessedDocument } from "../helpers/curriculum-ai";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

describe("008/US4 OpenRouter fora do ar ou sem chave não derruba a API", () => {
  describe("008/US4-2 sem OPENROUTER_API_KEY", () => {
    let t: TestApp;

    beforeAll(async () => {
      // The production definitions with the test config, where the key is always null.
      t = await createTestApp();
    });
    afterAll(() => t.close());

    it("a API inicia, \"Preencher com IA\" fica indisponível e o preenchimento manual da 004 funciona", async () => {
      expect(t.config.ai.openrouter.apiKey).toBeNull();
      expect((await api(t).get("/api/health/live")).status).toBe(200);
      await resetDb(t.prisma);
      await t.get(AiRegistrySync).sync();
      await t.prisma.aiAgent.update({ where: { key: "curriculum-agent" }, data: { status: "ACTIVE" } });
      const teacher = await createUser(t, { roles: ["TEACHER"] });
      const cookie = await loginAs(t, teacher);
      const { document } = await seedProcessedDocument(t, teacher.id);

      expect((await getCurriculumAiStatus(t, cookie, document.id)).body.availability).toBe("MODEL_UNAVAILABLE");
      expect((await requestAnalysis(t, cookie, document.id)).status).toBe(503);
      const client = api(t, { cookie });
      const draft = await client.post(`/api/syllabus-documents/${document.id}/revisions`, { source: "MANUAL" });
      expect(draft.status).toBe(201);
      const saved = await client.put(`/api/syllabus-revisions/${draft.body.id}`, {
        title: "Programação Orientada a Objetos",
        syllabusText: "Ementa escrita à mão.",
        competencyText: null,
        groups: [{ title: "Unidade 1", items: [{ text: "Classes e objetos" }] }],
      });
      expect(saved.status).toBe(200);
      expect((await client.post(`/api/syllabus-revisions/${draft.body.id}/confirm`, {})).status).toBe(200);
    });
  });

  describe("008/US4-3 008/SC-006 o provedor não responde", () => {
    let t: AiTestApp;
    let teacher: TestUser;
    let cookie: string;

    beforeAll(async () => {
      t = await createCurriculumAiApp();
    });
    afterAll(() => t.close());

    beforeEach(async () => {
      await resetAiDb(t);
      teacher = await createUser(t, { roles: ["TEACHER"] });
      cookie = await loginAs(t, teacher);
    });

    it("a análise termina com erro controlado dentro do prazo, e as rotas sem IA respondem durante a chamada", async () => {
      const { document } = await seedProcessedDocument(t, teacher.id);
      // Hangs far past the execution deadline.
      t.provider.script(fakeDelay(60_000, fakeOutput(pooOutput())));
      const { body } = await requestAnalysis(t, cookie, document.id);
      const deadline = new Date(Date.now() + 1_500);
      await t.prisma.aiExecution.update({ where: { id: body.execution.id }, data: { deadlineAt: deadline } });

      const started = Date.now();
      const running = t.get(AiExecutionWorker).runOnce();
      while (t.provider.requests.length === 0) await new Promise((resolve) => setTimeout(resolve, 10));

      // While the model call hangs, the rest of the API answers at once.
      const client = api(t, { cookie });
      for (const [path, res] of [
        ["/api/health/live", await api(t).get("/api/health/live")],
        ["/api/me", await client.get("/api/me")],
        ["/api/subjects", await client.get("/api/subjects")],
      ] as const) {
        expect(res.status, path).toBe(200);
      }
      expect(Date.now() - started).toBeLessThan(1_500);

      await running;
      const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.execution.id } });
      expect(execution).toMatchObject({ status: "TIMED_OUT", errorCode: "AI_TIMEOUT" });
      // Ended by the deadline, not by the provider.
      expect(execution.finishedAt!.getTime()).toBeLessThan(deadline.getTime() + 2_000);
      expect((await getCurriculumAiStatus(t, cookie, document.id)).body.lastExecution).toMatchObject({ status: "TIMED_OUT" });
    });
  });
});

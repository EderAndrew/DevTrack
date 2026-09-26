import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import {
  applyProposal,
  createCurriculumAiApp,
  createCurriculumProposal,
  getCurriculumAiStatus,
  pooOutput,
  requestAnalysis,
  scriptCurriculumRun,
  seedProcessedDocument,
} from "../helpers/curriculum-ai";
import { createUser, loginAs, type TestUser } from "../helpers/factories";

const ALL = ["title", "syllabusText", "competencyText", "group:0", "group:1", "group:2", "group:3"];

/** Wall time of `run`, in milliseconds. */
async function timed<T>(run: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = performance.now();
  const value = await run();
  return { value, ms: performance.now() - started };
}

/**
 * 007/SC-008 with the fake provider: the request answers at once (the work is queued), the
 * application of a proposal answers at once, and the whole cycle of a 10-page syllabus — read in
 * the worker thread, grounding, proposal — is far below 2 minutes. The real model's p95 comes from
 * the on-demand eval (`eval:curriculum`).
 */
describe("007/SC-008 desempenho do Curriculum Agent (provedor simulado sem atraso)", () => {
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

  it("o pedido de análise responde em menos de 1 s", async () => {
    const { document } = await seedProcessedDocument(t, teacher.id);
    const { value: res, ms } = await timed(() => requestAnalysis(t, cookie, document.id));
    expect(res.status).toBe(202);
    expect(ms).toBeLessThan(1_000);
  });

  it("a aplicação de uma proposta completa (4 grupos, 16 itens) responde em menos de 1 s", async () => {
    const { document } = await seedProcessedDocument(t, teacher.id);
    const proposal = await createCurriculumProposal(t, teacher.id, document);
    const { value: res, ms } = await timed(() => applyProposal(t, cookie, document.id, proposal.id, { acceptedItemIds: ALL, replaceDraft: false }));
    expect(res.status).toBe(200);
    expect(res.body.revision.itemCount).toBe(16);
    expect(ms).toBeLessThan(1_000);
  });

  it("o ciclo inteiro de dez-paginas.pdf (pedido, leitura, fundamentação, proposta) fica bem abaixo de 2 min", async () => {
    const { document } = await seedProcessedDocument(t, teacher.id, "dez-paginas.pdf");
    scriptCurriculumRun(t.provider, document.id, pooOutput());

    const { ms } = await timed(async () => {
      expect((await requestAnalysis(t, cookie, document.id)).status).toBe(202);
      await drain(t);
    });

    const status = await getCurriculumAiStatus(t, cookie, document.id);
    expect(status.body).toMatchObject({ lastOutcome: "PROPOSAL", pendingProposalId: expect.any(String) });
    expect(ms).toBeLessThan(15_000);
  });
});

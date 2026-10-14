import type { ExerciseTeacherView } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { validGeneratedBatch } from "../fixtures/exercise-generation/valid-batch";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import { batchRequest, createExerciseAiApp, requestBatch, scriptGeneration } from "../helpers/exercise-ai";
import { type ConfirmedTopic, createConfirmedTopic, createExercise } from "../helpers/exercises";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, testConfig } from "../helpers/test-app";

/**
 * 010/US4 — the teacher reviews what the AI generated: edits, deletes and approves the drafts of a
 * batch; the reviewer, the date and whether a person edited are recorded, the origin stays
 * AI_GENERATED, and the generator's proposal closes with the review (research X15).
 */

const config = { rateLimit: { ...testConfig().rateLimit, aiExecutionsPerMinute: 100, aiAgentPerHour: 100, exerciseAiPerHour: 100 } };

/** 1 open answer and 2 multiple choice, Intermediário, no trick question. */
const SHAPE = { difficulty: "INTERMEDIATE", counts: { OPEN_ANSWER: 1, MULTIPLE_CHOICE: 2, CODE: 0 }, trickQuestions: 0, language: null } as const;

/** The input of `PUT /exercises/:id` that rewrites `view` as it is, plus `patch`. */
function editBody(view: ExerciseTeacherView, patch: Record<string, unknown> = {}): Record<string, unknown> {
  const common = {
    type: view.type,
    statement: view.statement,
    explanation: view.explanation,
    difficulty: view.difficulty,
    cognitiveObjective: view.cognitiveObjective,
    ...(view.topic ? { syllabusItemId: view.topic.syllabusItemId } : {}),
    version: view.version,
  };
  const byType =
    view.type === "OPEN_ANSWER"
      ? { expectedAnswer: view.expectedAnswer }
      : view.type === "MULTIPLE_CHOICE"
        ? { alternatives: view.alternatives.map(({ text, isCorrect }) => ({ text, isCorrect })), isTrickQuestion: view.isTrickQuestion }
        : {
            instructions: view.instructions,
            ...(view.starterCode === null ? {} : { starterCode: view.starterCode }),
            expectedSolution: view.expectedSolution,
            languageId: view.language?.id,
          };
  return { ...common, ...byType, ...patch };
}

describe("010/US4 revisar, editar e aprovar o que a IA gerou", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let cookie: string;
  let topic: ConfirmedTopic;

  beforeAll(async () => {
    t = await createExerciseAiApp({ config });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    topic = await createConfirmedTopic(t, teacher.id, { languageKey: "java" });
  });

  const client = () => api(t, { cookie });

  /** A generated batch of SHAPE: its id and its drafts, open answer first. */
  async function generated(overrides: Record<string, unknown> = {}) {
    const res = await requestBatch(
      t,
      cookie,
      batchRequest(topic, { total: 3, types: ["OPEN_ANSWER", "MULTIPLE_CHOICE"], distribution: { mode: "MANUAL", counts: { OPEN_ANSWER: 1, MULTIPLE_CHOICE: 2 } }, ...overrides }),
    );
    expect(res.status).toBe(202);
    const batchId = res.body.id as string;
    scriptGeneration(t.provider, batchId, validGeneratedBatch({ ...SHAPE, counts: { ...SHAPE.counts } }));
    await drain(t);
    return { batchId, ...(await detail(batchId)) };
  }
  async function detail(batchId: string) {
    const res = await client().get(`/api/exercise-batches/${batchId}`);
    expect(res.status).toBe(200);
    const exercises = [...(res.body.exercises as ExerciseTeacherView[])].sort((a, b) => a.statement.localeCompare(b.statement));
    return { batch: res.body.batch as { approved: number; discarded: number; pendingReview: number; status: string }, exercises };
  }
  const proposal = async () => t.prisma.aiProposal.findFirstOrThrow();
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });

  it("010/US4-5 010/SC-005 010/FR-012 nenhuma execução deixa exercício APPROVED; o banco recusa AI aprovado sem revisão", async () => {
    const { exercises } = await generated();
    expect(exercises.map((exercise) => [exercise.status, exercise.origin, exercise.humanReviewed, exercise.reviewedBy])).toEqual(
      Array(3).fill(["DRAFT", "AI_GENERATED", false, null]),
    );
    await expect(t.prisma.exercise.update({ where: { id: exercises[0]!.id }, data: { status: "APPROVED" } })).rejects.toThrow();
    expect(await t.prisma.exercise.count({ where: { status: "APPROVED" } })).toBe(0);
  });

  describe("010/US4-1 010/FR-013 aprovar um rascunho da IA", () => {
    it("DRAFT → APPROVED com revisor e data, auditado; de novo → 200 sem evento; versão velha → 409", async () => {
      const { batchId, exercises } = await generated();
      const draft = exercises[0]!;
      const res = await client().post(`/api/exercises/${draft.id}/approve`, { version: draft.version });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: "APPROVED",
        origin: "AI_GENERATED",
        humanReviewed: true,
        humanEdited: false,
        reviewedBy: { name: teacher.name },
        version: draft.version + 1,
      });
      expect(Date.parse(res.body.reviewedAt)).not.toBeNaN();
      const approved = await events("exercise.approved");
      expect(approved).toHaveLength(1);
      expect(approved[0]).toMatchObject({ actorType: "USER", actorUserId: teacher.id, targetType: "EXERCISE", targetId: draft.id });
      expect(approved[0]!.metadata).toEqual({ origin: "AI_GENERATED", humanEdited: false, batchId });

      const again = await client().post(`/api/exercises/${draft.id}/approve`, { version: res.body.version });
      expect(again.status).toBe(200);
      expect(again.body.version).toBe(res.body.version);
      expect(await events("exercise.approved")).toHaveLength(1);

      const stale = await client().post(`/api/exercises/${draft.id}/approve`, { version: draft.version });
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe("EXERCISE_VERSION_CONFLICT");
      expect((await detail(batchId)).batch).toMatchObject({ approved: 1, pendingReview: 2 });
    });

    it("de outro professor → 404; sem versão → 400", async () => {
      const { exercises } = await generated();
      const other = await createUser(t, { roles: ["TEACHER"] });
      const otherClient = api(t, { cookie: await loginAs(t, other) });
      expect((await otherClient.post(`/api/exercises/${exercises[0]!.id}/approve`, { version: 1 })).status).toBe(404);
      expect((await client().post(`/api/exercises/${exercises[0]!.id}/approve`, {})).status).toBe(400);
    });
  });

  describe("010/US4-2 editar antes de aprovar", () => {
    it("marca editado por pessoa, mantém a origem, audita os campos; a aprovação diz que foi editado", async () => {
      const { batchId, exercises } = await generated();
      const mc = exercises.find((exercise) => exercise.type === "MULTIPLE_CHOICE")!;
      const alternatives = [
        { text: "Nova correta", isCorrect: true },
        { text: "Distrator 1", isCorrect: false },
        { text: "Distrator 2", isCorrect: false },
      ];
      const res = await client().put(`/api/exercises/${mc.id}`, editBody(mc, { statement: "Enunciado revisado", difficulty: "ADVANCED", alternatives }));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        statement: "Enunciado revisado",
        difficulty: "ADVANCED",
        origin: "AI_GENERATED",
        status: "DRAFT",
        humanEdited: true,
        humanReviewed: false,
        version: mc.version + 1,
        batchId,
      });
      expect(res.body.alternatives.map((alternative: { text: string }) => alternative.text)).toEqual(["Nova correta", "Distrator 1", "Distrator 2"]);
      const edited = await events("exercise.edited");
      expect(edited).toHaveLength(1);
      expect(edited[0]).toMatchObject({ actorUserId: teacher.id, targetType: "EXERCISE", targetId: mc.id });
      expect(edited[0]!.metadata).toEqual({ origin: "AI_GENERATED", status: "DRAFT", fields: ["statement", "difficulty", "alternatives"], testCaseCount: 0, publicTestCaseCount: 0 });
      expect(JSON.stringify(edited[0]!.metadata)).not.toContain("revisado");

      const approved = await client().post(`/api/exercises/${mc.id}/approve`, { version: res.body.version });
      expect(approved.body).toMatchObject({ status: "APPROVED", origin: "AI_GENERATED", humanEdited: true, humanReviewed: true });
      expect((await events("exercise.approved"))[0]!.metadata).toMatchObject({ humanEdited: true });
    });

    it("salvar sem mudança não conta como edição; a versão não muda", async () => {
      const { exercises } = await generated();
      const res = await client().put(`/api/exercises/${exercises[0]!.id}`, editBody(exercises[0]!));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ humanEdited: false, version: exercises[0]!.version });
      expect(await events("exercise.edited")).toHaveLength(0);
    });

    it("010/FR-031 o tópico de um exercício da IA não muda; o tipo de nenhum exercício muda", async () => {
      const { exercises } = await generated();
      const other = await createConfirmedTopic(t, teacher.id, { languageKey: null });
      const draft = exercises[0]!;
      expect((await client().put(`/api/exercises/${draft.id}`, editBody(draft, { syllabusItemId: other.itemId }))).status).toBe(400);
      const asMc = editBody(draft, { type: "MULTIPLE_CHOICE", expectedAnswer: undefined, alternatives: [{ text: "A", isCorrect: true }, { text: "B", isCorrect: false }, { text: "C", isCorrect: false }], isTrickQuestion: false });
      expect((await client().put(`/api/exercises/${draft.id}`, asMc)).status).toBe(400);
      expect(await events("exercise.edited")).toHaveLength(0);
    });

    it("um exercício manual editado não ganha a marca da IA", async () => {
      const manual = await createExercise(t, teacher.id, { status: "APPROVED" });
      const view = (await client().get(`/api/exercises/${manual.id}`)).body as ExerciseTeacherView;
      const res = await client().put(`/api/exercises/${manual.id}`, editBody(view, { explanation: "Outra explicação" }));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ origin: "MANUAL", status: "APPROVED", humanEdited: false, explanation: "Outra explicação" });
      expect((await events("exercise.edited"))[0]!.metadata).toEqual({ origin: "MANUAL", status: "APPROVED", fields: ["explanation"], testCaseCount: 0, publicTestCaseCount: 0 });
    });
  });

  describe("010/US4-3 010/FR-014 excluir um rascunho do lote", () => {
    it("some do lote, não pode ser aprovado, e o lote conta o descarte", async () => {
      const { batchId, exercises } = await generated();
      const draft = exercises[1]!;
      const res = await client().delete(`/api/exercises/${draft.id}`, { version: draft.version });
      expect(res.status).toBe(204);
      expect((await client().get(`/api/exercises/${draft.id}`)).status).toBe(404);
      expect((await client().post(`/api/exercises/${draft.id}/approve`, { version: draft.version })).status).toBe(404);
      const after = await detail(batchId);
      expect(after.batch).toMatchObject({ discarded: 1, pendingReview: 2 });
      expect(after.exercises.map((exercise) => exercise.id)).not.toContain(draft.id);
      expect(await t.prisma.exerciseAlternative.count({ where: { exerciseId: draft.id } })).toBe(0);
      const discarded = await events("exercise.discarded");
      expect(discarded).toHaveLength(1);
      expect(discarded[0]).toMatchObject({ actorUserId: teacher.id, targetType: "EXERCISE_BATCH", targetId: batchId });
      expect(discarded[0]!.metadata).toEqual({ exerciseId: draft.id, batchId });
    });

    it("aprovado, manual ou versão velha → 409; nada muda", async () => {
      const { exercises } = await generated();
      const [first, second] = exercises;
      const approved = await client().post(`/api/exercises/${first!.id}/approve`, { version: first!.version });
      expect((await client().delete(`/api/exercises/${first!.id}`, { version: approved.body.version })).status).toBe(409);
      const manual = await createExercise(t, teacher.id, { status: "DRAFT" });
      expect((await client().delete(`/api/exercises/${manual.id}`, { version: 1 })).status).toBe(409);
      const stale = await client().delete(`/api/exercises/${second!.id}`, { version: second!.version + 1 });
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe("EXERCISE_VERSION_CONFLICT");
      expect(await t.prisma.exercise.count()).toBe(4);
      expect(await events("exercise.discarded")).toHaveLength(0);
    });
  });

  describe("010/US4-4 edição que quebra uma regra é recusada e o exercício fica como estava", () => {
    it("duas corretas, campo vazio → 400; arquivado → 409", async () => {
      const { exercises } = await generated();
      const mc = exercises.find((exercise) => exercise.type === "MULTIPLE_CHOICE")!;
      const twoCorrect = mc.alternatives.map(({ text }) => ({ text, isCorrect: true }));
      expect((await client().put(`/api/exercises/${mc.id}`, editBody(mc, { alternatives: twoCorrect }))).status).toBe(400);
      expect((await client().put(`/api/exercises/${mc.id}`, editBody(mc, { statement: "  " }))).status).toBe(400);
      const unchanged = (await client().get(`/api/exercises/${mc.id}`)).body as ExerciseTeacherView;
      expect(unchanged).toEqual(mc);

      await t.prisma.exercise.update({ where: { id: mc.id }, data: { status: "ARCHIVED", archivedFromStatus: "DRAFT" } });
      const archived = await client().put(`/api/exercises/${mc.id}`, editBody(mc, { statement: "Outro" }));
      expect(archived.status).toBe(409);
      expect(archived.body.code).toBe("INVALID_STATE_TRANSITION");
      expect((await client().post(`/api/exercises/${mc.id}/approve`, { version: mc.version })).status).toBe(409);
      expect(await events("exercise.edited")).toHaveLength(0);
    });
  });

  describe("aprovar vários rascunhos do lote de uma vez (010/FR-014)", () => {
    it("aprova os escolhidos; ids de outro lote → 404 sem aprovar nenhum", async () => {
      const { batchId, exercises } = await generated();
      const res = await client().post(`/api/exercise-batches/${batchId}/approve`, { exerciseIds: [exercises[0]!.id, exercises[2]!.id] });
      expect(res.status).toBe(200);
      expect(res.body.items.map((item: ExerciseTeacherView) => [item.id, item.status, item.reviewedBy?.name])).toEqual([
        [exercises[0]!.id, "APPROVED", teacher.name],
        [exercises[2]!.id, "APPROVED", teacher.name],
      ]);
      expect(await events("exercise.approved")).toHaveLength(2);
      expect((await detail(batchId)).batch).toMatchObject({ approved: 2, pendingReview: 1 });

      const manual = await createExercise(t, teacher.id, { status: "DRAFT" });
      const mixed = await client().post(`/api/exercise-batches/${batchId}/approve`, { exerciseIds: [exercises[1]!.id, manual.id] });
      expect(mixed.status).toBe(404);
      expect((await client().get(`/api/exercises/${exercises[1]!.id}`)).body.status).toBe("DRAFT");
    });
  });

  describe("a proposta da IA fecha junto com a revisão do lote (research X15)", () => {
    it("todos aprovados → APPROVED; a decisão da 006 recusa APPROVE", async () => {
      const { batchId, exercises } = await generated();
      const pending = await proposal();
      const refused = await client().post(`/api/ai/proposals/${pending.id}/decision`, { decision: "APPROVE" });
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe("AI_PROPOSAL_APPLY_REQUIRED");

      await client().post(`/api/exercise-batches/${batchId}/approve`, { exerciseIds: [exercises[0]!.id, exercises[1]!.id] });
      expect((await proposal()).status).toBe("READY_FOR_REVIEW");
      await client().post(`/api/exercises/${exercises[2]!.id}/approve`, { version: exercises[2]!.version });
      expect(await proposal()).toMatchObject({ status: "APPROVED", decidedByUserId: teacher.id });
      expect(await events("ai_proposal.approved")).toHaveLength(1);
    });

    it("parte aprovada e o resto excluído → APPROVED_PARTIALLY com os itens aprovados", async () => {
      const { exercises } = await generated();
      const approved = await client().post(`/api/exercises/${exercises[0]!.id}/approve`, { version: exercises[0]!.version });
      await client().delete(`/api/exercises/${exercises[1]!.id}`, { version: exercises[1]!.version });
      await client().delete(`/api/exercises/${exercises[2]!.id}`, { version: exercises[2]!.version });
      const closed = await proposal();
      const row = await t.prisma.exercise.findUniqueOrThrow({ where: { id: approved.body.id } });
      expect(closed.status).toBe("PARTIALLY_APPROVED");
      expect(closed.acceptedItemIds).toHaveLength(1);
      expect(closed.itemIds).toContain(closed.acceptedItemIds[0]);
      expect(row.generationItemId).not.toBeNull();
    });

    it("todos excluídos → REJECTED", async () => {
      const { exercises } = await generated();
      for (const exercise of exercises) await client().delete(`/api/exercises/${exercise.id}`, { version: exercise.version });
      expect((await proposal()).status).toBe("REJECTED");
    });

    it("proposta vencida fica como está; a revisão continua", async () => {
      const { exercises } = await generated();
      await t.prisma.aiProposal.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      for (const exercise of exercises) {
        expect((await client().post(`/api/exercises/${exercise.id}/approve`, { version: exercise.version })).status).toBe(200);
      }
      expect((await proposal()).status).toBe("READY_FOR_REVIEW");
    });
  });

  it("010/US4-6 gerar de novo cria um lote ligado; os rascunhos do anterior continuam", async () => {
    const first = await generated();
    const again = await generated({ regeneratedFromId: first.batchId });
    expect(again.batchId).not.toBe(first.batchId);
    expect((await detail(again.batchId)).batch).toMatchObject({ status: "GENERATED", pendingReview: 3 });
    expect((await t.prisma.exerciseGenerationBatch.findUniqueOrThrow({ where: { id: again.batchId } })).regeneratedFromId).toBe(first.batchId);
    expect((await detail(first.batchId)).batch).toMatchObject({ pendingReview: 3 });
  });
});

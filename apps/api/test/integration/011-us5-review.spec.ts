import type {
  UpdateWorkRequest,
  WorkQuestionEdit,
  WorkTeacherView,
} from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { validGeneratedWork } from "../fixtures/work-generation/valid-work";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import {
  createConfirmedRevision,
  createUser,
  loginAs,
  type TestUser,
} from "../helpers/factories";
import { api, testConfig } from "../helpers/test-app";
import {
  createWorkAiApp,
  requestWork,
  scriptWorkGeneration,
  workGenerationRequest,
} from "../helpers/work-ai";
import {
  type ConfirmedSyllabus,
  createConfirmedSyllabus,
  createWork,
  toUpdateBody,
  workLanguageId,
} from "../helpers/works";

/**
 * 011/US5 — the teacher reviews, edits and approves a work: the whole work goes back with its
 * version, the values are recalculated, an AI work keeps its origin and records the person's edit
 * and review, and only a person approves (011/FR-014–FR-017, SC-006). The AI proposal closes with
 * the approval, in the same transaction (research W10).
 */

const config = {
  rateLimit: {
    ...testConfig().rateLimit,
    aiExecutionsPerMinute: 100,
    aiAgentPerHour: 100,
    workAiPerHour: 100,
  },
};

const newOpenAnswer = (
  statement = "Pergunta nova do professor",
): WorkQuestionEdit => ({
  type: "OPEN_ANSWER",
  statement,
  expectedAnswer: "Resposta nova",
});

describe("011/US5 revisar, editar e aprovar o trabalho", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let cookie: string;
  let client: ReturnType<typeof api>;
  let syllabus: ConfirmedSyllabus;

  beforeAll(async () => {
    t = await createWorkAiApp({ config });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, {
      roles: ["TEACHER"],
      name: "Professora Ana",
    });
    cookie = await loginAs(t, teacher);
    client = api(t, { cookie });
    syllabus = await createConfirmedSyllabus(t, teacher.id);
  });

  const view = async (workId: string): Promise<WorkTeacherView> => {
    const res = await client.get(`/api/works/${workId}`);
    expect(res.status).toBe(200);
    return res.body as WorkTeacherView;
  };
  const put = (
    work: WorkTeacherView,
    overrides: Partial<UpdateWorkRequest> = {},
  ) =>
    client.put(`/api/works/${work.id}`, {
      ...toUpdateBody(work),
      ...overrides,
    });
  const approve = (work: Pick<WorkTeacherView, "id" | "version">) =>
    client.post(`/api/works/${work.id}/approve`, { version: work.version });
  const events = (type: string) =>
    t.prisma.auditEvent.findMany({
      where: { type },
      orderBy: { id: "asc" },
    });
  const proposal = () => t.prisma.aiProposal.findFirstOrThrow();

  /** A generated DRAFT work: 1 open answer, 1 multiple choice (a trick question), 1 code question in Java, "3.00". */
  async function generated(): Promise<WorkTeacherView> {
    const res = await requestWork(
      t,
      cookie,
      workGenerationRequest(syllabus, {
        total: 3,
        types: ["OPEN_ANSWER", "MULTIPLE_CHOICE", "CODE"],
        trickQuestions: 1,
      }),
    );
    expect(res.status).toBe(202);
    scriptWorkGeneration(
      t.provider,
      res.body.id,
      validGeneratedWork({
        difficulty: "INTERMEDIATE",
        counts: { OPEN_ANSWER: 1, MULTIPLE_CHOICE: 1, CODE: 1 },
        trickQuestions: 1,
        language: "Java",
        topicCount: 1,
      }),
    );
    await drain(t);
    const request = await client.get(
      `/api/work-generation-requests/${res.body.id}`,
    );
    expect(request.body.status).toBe("GENERATED");
    return view(request.body.workId as string);
  }

  /** The work as it was: same version, same content. */
  async function expectUnchanged(before: WorkTeacherView) {
    const after = await view(before.id);
    expect(after).toEqual(before);
  }

  describe("011/US5-1 011/SC-006 aprovar um trabalho gerado", () => {
    it("DRAFT → APPROVED com revisor e data, human_reviewed, auditado; a proposta fecha APPROVE e a decisão da 006 recusa APPROVE", async () => {
      const work = await generated();
      expect(work).toMatchObject({
        origin: "AI_GENERATED",
        status: "DRAFT",
        humanReviewed: false,
        humanEdited: false,
        reviewedBy: null,
        reviewedAt: null,
      });
      const pending = await proposal();
      expect(pending.status).toBe("READY_FOR_REVIEW");
      const refused = await client.post(
        `/api/ai/proposals/${pending.id}/decision`,
        { decision: "APPROVE" },
      );
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe("AI_PROPOSAL_APPLY_REQUIRED");

      const res = await approve(work);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: "APPROVED",
        origin: "AI_GENERATED",
        humanReviewed: true,
        humanEdited: false,
        reviewedBy: { name: "Professora Ana" },
        version: work.version + 1,
      });
      expect(Date.parse(res.body.reviewedAt)).not.toBeNaN();
      const [approved] = await events("work.approved");
      expect(approved).toMatchObject({
        actorUserId: teacher.id,
        targetType: "WORK",
        targetId: work.id,
      });
      expect(approved!.metadata).toEqual({
        origin: "AI_GENERATED",
        humanEdited: false,
        generationRequestId: work.generationRequestId,
        warnings: [],
      });
      expect(await proposal()).toMatchObject({
        status: "APPROVED",
        decidedByUserId: teacher.id,
      });
    });

    it("aprovar de novo com a versão atual → 200 sem evento; versão antiga → 409 WORK_VERSION_CONFLICT", async () => {
      const work = await generated();
      const first = await approve(work);
      const again = await approve(first.body);
      expect(again.status).toBe(200);
      expect(again.body.version).toBe(first.body.version);
      expect(await events("work.approved")).toHaveLength(1);
      const stale = await approve(work);
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe("WORK_VERSION_CONFLICT");
    });

    it("011/FR-015 011/FR-007 aprovação com código sem casos de teste devolve o aviso na visão e na auditoria", async () => {
      const work = await createWork(t, teacher.id, {
        status: "DRAFT",
        questions: [{ type: "OPEN_ANSWER" }, { type: "CODE", testCases: [] }],
        totalGrade: "2.00",
      });
      const res = await approve({ id: work.id, version: work.version });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("APPROVED");
      expect(res.body.warnings).toEqual([
        { code: "CODE_QUESTION_WITHOUT_TEST_CASES", positions: [1] },
      ]);
      expect((await events("work.approved"))[0]!.metadata).toMatchObject({
        origin: "MANUAL",
        warnings: ["CODE_QUESTION_WITHOUT_TEST_CASES"],
      });
    });
  });

  describe("011/US5-2 011/FR-017 editar um trabalho gerado antes de aprovar", () => {
    it("marca human_edited, mantém a origem, audita work.edited e a aprovação registra a edição por pessoa", async () => {
      const work = await generated();
      const questions = toUpdateBody(work).questions.map((question, index) =>
        index === 0
          ? { ...question, statement: "Enunciado revisto pelo professor" }
          : question,
      );
      const res = await put(work, { title: "Título revisto", questions });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        origin: "AI_GENERATED",
        status: "DRAFT",
        humanEdited: true,
        humanReviewed: false,
        title: "Título revisto",
        version: work.version + 1,
      });
      expect(
        res.body.questions.map((question: { id: string }) => question.id),
      ).toEqual(work.questions.map((question) => question.id));
      const [edited] = await events("work.edited");
      expect(edited).toMatchObject({
        actorUserId: teacher.id,
        targetType: "WORK",
        targetId: work.id,
      });
      expect(edited!.metadata).toEqual({
        origin: "AI_GENERATED",
        status: "DRAFT",
        fields: ["title", "questions"],
        questionCountChanged: false,
        questionsAdded: 0,
        questionsRemoved: 0,
        reordered: false,
      });

      const approved = await approve(res.body);
      expect(approved.body).toMatchObject({
        status: "APPROVED",
        origin: "AI_GENERATED",
        humanEdited: true,
        humanReviewed: true,
      });
      expect((await events("work.approved"))[0]!.metadata).toMatchObject({
        humanEdited: true,
      });
      // No generated question was removed: the proposal closes APPROVE.
      expect((await proposal()).status).toBe("APPROVED");
    });

    it("salvar sem mudar nada → 200, mesma versão, sem evento e sem human_edited", async () => {
      const work = await generated();
      const res = await put(work);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        version: work.version,
        humanEdited: false,
      });
      expect(await events("work.edited")).toHaveLength(0);
    });

    it("remover uma questão gerada, acrescentar uma e reordenar → proposta APPROVE_PARTIALLY com os itens que sobraram", async () => {
      const work = await generated();
      const [, mc, code] = toUpdateBody(work).questions;
      const res = await put(work, { questions: [code!, newOpenAnswer(), mc!] });
      expect(res.status).toBe(200);
      expect(
        res.body.questions.map(
          (question: { id: string; type: string }) => question.type,
        ),
      ).toEqual(["CODE", "OPEN_ANSWER", "MULTIPLE_CHOICE"]);
      expect(res.body.questions[0].id).toBe(work.questions[2]!.id);
      expect(res.body.questions[2].id).toBe(work.questions[1]!.id);
      expect((await events("work.edited"))[0]!.metadata).toEqual({
        origin: "AI_GENERATED",
        status: "DRAFT",
        fields: [],
        questionCountChanged: false,
        questionsAdded: 1,
        questionsRemoved: 1,
        reordered: true,
      });

      await approve(res.body);
      expect(await proposal()).toMatchObject({
        status: "PARTIALLY_APPROVED",
        acceptedItemIds: ["question:1", "question:2"],
      });
    });
  });

  describe("011/US5-3 limites de 1 a 10 questões na edição", () => {
    it("acrescentar a 11ª → 400 e nada muda", async () => {
      const created = await createWork(t, teacher.id, {
        status: "DRAFT",
        totalGrade: "10.00",
        questions: Array.from({ length: 10 }, () => ({})),
      });
      const work = await view(created.id);
      const res = await put(work, {
        totalGrade: "11.00",
        questions: [...toUpdateBody(work).questions, newOpenAnswer()],
      });
      expect(res.status).toBe(400);
      await expectUnchanged(work);
    });

    it("remover a última → 400 e nada muda", async () => {
      const work = await view(
        (await createWork(t, teacher.id, { status: "DRAFT" })).id,
      );
      const res = await put(work, { questions: [] });
      expect(res.status).toBe(400);
      await expectUnchanged(work);
    });
  });

  describe("011/US5-4 edição que quebra uma regra é recusada e o trabalho fica como estava", () => {
    it.each<[string, (question: WorkQuestionEdit) => WorkQuestionEdit, number]>(
      [
        [
          "Múltipla escolha com duas corretas",
          (question) =>
            ({
              ...question,
              alternatives: [
                { text: "A", isCorrect: true },
                { text: "B", isCorrect: true },
                { text: "C", isCorrect: false },
              ],
            }) as WorkQuestionEdit,
          1,
        ],
        [
          "questão sem gabarito",
          (question) =>
            ({ ...question, expectedAnswer: "   " }) as WorkQuestionEdit,
          0,
        ],
        [
          "código sem solução",
          (question) =>
            ({ ...question, expectedSolution: "" }) as WorkQuestionEdit,
          2,
        ],
        [
          "trocar o tipo de uma questão existente",
          (question) => ({ ...newOpenAnswer(), id: question.id }),
          1,
        ],
      ],
    )("%s → 400", async (_, patch, index) => {
      const work = await generated();
      const questions = toUpdateBody(work).questions.map(
        (question, position) =>
          position === index ? patch(question) : question,
      );
      const res = await put(work, { questions });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      await expectUnchanged(work);
      expect(await events("work.edited")).toHaveLength(0);
    });

    it("id de questão de outro trabalho → 404 e nada muda", async () => {
      const work = await generated();
      const other = await createWork(t, teacher.id, {
        status: "DRAFT",
        questions: [{ type: "OPEN_ANSWER" }],
      });
      const questions = toUpdateBody(work).questions.map(
        (question, position) =>
          position === 0
            ? { ...question, id: other.questions[0]!.id }
            : question,
      );
      const res = await put(work, { questions });
      expect(res.status).toBe(404);
      await expectUnchanged(work);
    });

    it("versão antiga → 409 WORK_VERSION_CONFLICT e nada muda", async () => {
      const work = await generated();
      const saved = await put(work, { title: "Primeira edição" });
      expect(saved.status).toBe(200);
      const stale = await put(work, { title: "Edição da outra aba" });
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe("WORK_VERSION_CONFLICT");
      expect((await view(work.id)).title).toBe("Primeira edição");
    });
  });

  it("011/US5-5 011/FR-014 nenhuma execução deixa trabalho APPROVED", async () => {
    const work = await generated();
    expect(work.status).toBe("DRAFT");
    expect(
      await t.prisma.work.count({ where: { status: { not: "DRAFT" } } }),
    ).toBe(0);
    expect(await events("work.approved")).toHaveLength(0);
  });

  describe("011/US5-7 011/FR-016 editar um trabalho APPROVED", () => {
    it("as regras valem de novo, a edição é auditada e o trabalho continua APPROVED", async () => {
      const work = await view(
        (
          await createWork(t, teacher.id, {
            status: "APPROVED",
            syllabus,
            questions: [{ type: "OPEN_ANSWER" }],
          })
        ).id,
      );
      const broken = await put(work, {
        questions: [
          {
            ...toUpdateBody(work).questions[0]!,
            expectedAnswer: "",
          } as WorkQuestionEdit,
        ],
      });
      expect(broken.status).toBe(400);
      await expectUnchanged(work);

      const res = await put(work, {
        description: "Nova descrição",
        difficulty: "ADVANCED",
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: "APPROVED",
        description: "Nova descrição",
        difficulty: "ADVANCED",
        humanEdited: false,
      });
      expect((await events("work.edited"))[0]!.metadata).toMatchObject({
        origin: "MANUAL",
        status: "APPROVED",
        fields: ["description", "difficulty"],
      });
    });

    it("ARCHIVED não edita nem aprova (409)", async () => {
      const work = await view(
        (
          await createWork(t, teacher.id, {
            status: "ARCHIVED",
            archivedFromStatus: "DRAFT",
          })
        ).id,
      );
      const edit = await put(work, { title: "Outro" });
      expect(edit.status).toBe(409);
      expect(edit.body.code).toBe("INVALID_STATE_TRANSITION");
      const approval = await approve(work);
      expect(approval.status).toBe(409);
      expect(approval.body.code).toBe("INVALID_STATE_TRANSITION");
      await expectUnchanged(work);
    });
  });

  it("011/FR-007 questão com linguagem desativada depois continua editável sem trocar a linguagem; nova questão com ela → 400", async () => {
    const python = await workLanguageId(t, "python");
    const work = await view(
      (
        await createWork(t, teacher.id, {
          status: "DRAFT",
          questions: [{ type: "CODE", languageId: python }],
        })
      ).id,
    );
    await t.prisma.programmingLanguage.update({
      where: { id: python },
      data: { active: false },
    });
    try {
      const [question] = toUpdateBody(work).questions;
      const kept = await put(work, {
        questions: [{ ...question!, statement: "Enunciado revisto" }],
      });
      expect(kept.status).toBe(200);
      expect(kept.body.questions[0].language).toEqual({
        id: python,
        name: expect.any(String),
      });

      const added = await put(kept.body, {
        totalGrade: "2.00",
        questions: [
          ...toUpdateBody(kept.body).questions,
          { ...question!, id: undefined, statement: "Outra" },
        ],
      });
      expect(added.status).toBe(400);
    } finally {
      await t.prisma.programmingLanguage.update({
        where: { id: python },
        data: { active: true },
      });
    }
  });

  it("011/FR-016 nova revisão da ementa confirmada não muda os tópicos do trabalho", async () => {
    const work = await view(
      (
        await createWork(t, teacher.id, {
          status: "DRAFT",
          syllabus,
          topicItemIds: syllabus.itemIds.slice(0, 2),
        })
      ).id,
    );
    await createConfirmedRevision(t, syllabus.document.id, [
      { title: "Nova", items: ["Outro tópico"] },
    ]);
    const after = await view(work.id);
    expect(after.syllabusRevisionId).toBe(syllabus.revision.id);
    expect(after.topics).toEqual(work.topics);
    const res = await put(after, { title: "Editado depois da nova revisão" });
    expect(res.status).toBe(200);
    expect(res.body.topics).toEqual(work.topics);
  });

  it("011/FR-016 trocar os tópicos: os da questão precisam estar entre os do trabalho", async () => {
    const work = await view(
      (
        await createWork(t, teacher.id, {
          status: "DRAFT",
          syllabus,
          topicItemIds: [syllabus.itemIds[0]!],
        })
      ).id,
    );
    const topics = {
      syllabusRevisionId: syllabus.revision.id,
      syllabusItemIds: [syllabus.itemIds[1]!, syllabus.itemIds[2]!],
    };
    const [question] = toUpdateBody(work).questions;
    const res = await put(work, {
      topics,
      questions: [{ ...question!, topicItemIds: [syllabus.itemIds[2]!] }],
    });
    expect(res.status).toBe(200);
    expect(
      res.body.topics.map(
        (topic: { syllabusItemId: string }) => topic.syllabusItemId,
      ),
    ).toEqual(topics.syllabusItemIds);
    expect(res.body.questions[0].topicItemIds).toEqual([syllabus.itemIds[2]]);
    expect((await events("work.edited"))[0]!.metadata).toMatchObject({
      fields: ["topics", "questions"],
    });

    const none = await put(res.body, {
      topics: null,
      questions: [
        { ...toUpdateBody(res.body).questions[0]!, topicItemIds: [] },
      ],
    });
    expect(none.status).toBe(200);
    expect(none.body).toMatchObject({ syllabusRevisionId: null, topics: [] });
  });

  it("011/FR-016 um trabalho gerado não fica sem tópicos nem sem dificuldade → 400", async () => {
    const work = await generated();
    const questions = toUpdateBody(work).questions.map((question) => ({
      ...question,
      topicItemIds: [],
    }));
    expect((await put(work, { topics: null, questions })).status).toBe(400);
    expect((await put(work, { difficulty: null })).status).toBe(400);
    await expectUnchanged(work);
  });
});

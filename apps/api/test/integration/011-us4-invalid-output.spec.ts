import type {
  GeneratedWork,
  GeneratedWorkQuestion,
  WorkGenerationRequestView,
} from "@repo/contracts";
import { Logger } from "@nestjs/common";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { defineCatalogModel } from "../../src/modules/ai/definitions/types";
import { AuditService } from "../../src/modules/audit/audit.service";
import { WORK_GENERATION_TASK } from "../../src/modules/work-ai/definitions/work-generator";
import { READ_WORK_GENERATION_REQUEST } from "../../src/modules/work-ai/generation/request-content";
import {
  fakeOutput,
  fakeText,
  fakeToolCall,
  type FakeStep,
} from "../fixtures/ai/fake-model-provider";
import {
  validGeneratedWork,
  type WorkGenerationShape,
} from "../fixtures/work-generation/valid-work";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import { createUser, loginAs } from "../helpers/factories";
import { api, testConfig } from "../helpers/test-app";
import {
  createWorkAiApp,
  requestWork,
  scriptWorkGeneration,
  TEST_WORK_MODEL_CONFIG,
  workGenerationRequest,
} from "../helpers/work-ai";
import {
  type ConfirmedSyllabus,
  createConfirmedSyllabus,
} from "../helpers/works";

/**
 * 011/US4 — an AI answer that doesn't match the request never becomes a work: the strict schema,
 * then the registered request (research W13), both before any write; the request ends FAILED with
 * no work, question, alternative, test case or topic, and a failure inside `materialize` rolls
 * everything back (011/FR-027–FR-029, SC-005).
 */

const config = {
  rateLimit: {
    ...testConfig().rateLimit,
    aiExecutionsPerMinute: 100,
    aiAgentPerHour: 100,
    workAiPerHour: 100,
  },
};

/** 1 open answer, 2 multiple choice (1 trick question) and 2 code questions in Java, Intermediário, on 4 topics. */
const SHAPE: WorkGenerationShape = {
  difficulty: "INTERMEDIATE",
  counts: { OPEN_ANSWER: 1, MULTIPLE_CHOICE: 2, CODE: 2 },
  trickQuestions: 1,
  language: "Java",
  topicCount: 4,
};
const MARKER = "MARCADOR-SAIDA-INVALIDA-011";
const valid = () => validGeneratedWork(SHAPE, MARKER);
// Topic refs of `valid()`: T1, T2, T3, T4, T1.
const OPEN = 0;
const MC = 1; // the first multiple-choice question, a trick question
const CODE = 3; // the first code question

type Code = Extract<GeneratedWorkQuestion, { type: "CODE" }>;

function patched(
  index: number,
  patch: (question: GeneratedWorkQuestion) => unknown,
): GeneratedWork {
  const questions = [...valid().questions];
  questions[index] = patch(questions[index]!) as GeneratedWorkQuestion;
  return { questions };
}
const code = (patch: Partial<Code>) => (question: GeneratedWorkQuestion) => ({
  ...(question as Code),
  ...patch,
});
const refs = (topicRefs: string[]) => (question: GeneratedWorkQuestion) => ({
  ...question,
  topicRefs,
});
const alternatives =
  (texts: [string, boolean][]) => (question: GeneratedWorkQuestion) => ({
    ...question,
    alternatives: texts.map(([text, isCorrect]) => ({ text, isCorrect })),
  });

/** An approved STANDARD entry for `work-generation`: the escalation's target (009 research H9). */
const STANDARD_MODEL = "anthropic/modelo-standard-teste-011";
const TEST_WORK_STANDARD = defineCatalogModel({
  ...TEST_WORK_MODEL_CONFIG,
  key: "fake-work-standard",
  model: STANDARD_MODEL,
  tier: "STANDARD",
  approvals: (TEST_WORK_MODEL_CONFIG.approvals ?? []).filter(
    (approval) => approval.taskKey === WORK_GENERATION_TASK.key,
  ),
});

async function setup(t: AiTestApp) {
  await resetAiDb(t);
  const teacher = await createUser(t, { roles: ["TEACHER"] });
  const cookie = await loginAs(t, teacher);
  const syllabus = await createConfirmedSyllabus(t, teacher.id);
  return { cookie, syllabus };
}

/** Requests the SHAPE work on the first 4 topics of `syllabus`, returning its id. */
async function request(
  t: AiTestApp,
  cookie: string,
  syllabus: ConfirmedSyllabus,
): Promise<string> {
  const res = await requestWork(
    t,
    cookie,
    workGenerationRequest(syllabus, {
      syllabusItemIds: syllabus.itemIds.slice(0, 4),
      title: "Trabalho do pedido",
      description: "Descrição do pedido",
      totalGrade: "5.00",
      total: 5,
      types: ["OPEN_ANSWER", "MULTIPLE_CHOICE", "CODE"],
      distribution: { mode: "MANUAL", counts: SHAPE.counts },
      trickQuestions: 1,
    }),
  );
  expect(res.status).toBe(202);
  return res.body.id as string;
}

/** Nothing of the request was written: no work or part of one, no proposal, no `generated_at`. */
async function expectNothingWritten(t: AiTestApp, requestId: string) {
  expect(await t.prisma.work.count()).toBe(0);
  expect(await t.prisma.workTopic.count()).toBe(0);
  expect(await t.prisma.workQuestion.count()).toBe(0);
  expect(await t.prisma.workQuestionAlternative.count()).toBe(0);
  expect(await t.prisma.workQuestionTestCase.count()).toBe(0);
  expect(await t.prisma.workQuestionTopic.count()).toBe(0);
  expect(await t.prisma.aiProposal.count()).toBe(0);
  expect(
    await t.prisma.auditEvent.count({
      where: {
        type: { in: ["work_generation.generated", "ai_proposal.created"] },
      },
    }),
  ).toBe(0);
  expect(
    (
      await t.prisma.workGenerationRequest.findUniqueOrThrow({
        where: { id: requestId },
      })
    ).generatedAt,
  ).toBeNull();
}

describe("011/US4 resposta da IA inválida nunca vira trabalho", () => {
  let t: AiTestApp;
  let cookie: string;
  let syllabus: ConfirmedSyllabus;

  beforeAll(async () => {
    t = await createWorkAiApp({ config });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    ({ cookie, syllabus } = await setup(t));
  });

  /** Runs one generation that answers `answer` and returns the request as the teacher sees it. */
  async function generate(
    answer: FakeStep,
  ): Promise<{ requestId: string; view: WorkGenerationRequestView }> {
    const requestId = await request(t, cookie, syllabus);
    t.provider.script(
      fakeToolCall(READ_WORK_GENERATION_REQUEST, { requestId }),
      answer,
    );
    await drain(t);
    const res = await api(t, { cookie }).get(
      `/api/work-generation-requests/${requestId}`,
    );
    expect(res.status).toBe(200);
    return { requestId, view: res.body as WorkGenerationRequestView };
  }

  describe("011/US4-1 011/SC-005 resposta fora do esquema → pedido FAILED, nada gravado, e o professor pode pedir de novo", () => {
    it.each([
      ["objeto sem as questões", fakeOutput({ unexpected: true })],
      [
        "tipo desconhecido",
        fakeOutput({ questions: [{ type: "TRUE_FALSE", statement: "x" }] }),
      ],
      ["texto livre", fakeText(`${MARKER}: não é JSON`)],
    ])("%s", async (_, answer) => {
      const { requestId, view } = await generate(answer);
      expect(view).toMatchObject({
        status: "FAILED",
        workId: null,
        generatedAt: null,
      });
      expect(view.failureCode).toMatch(/^AI_OUTPUT_(VALIDATION|PARSE)_FAILED$/);
      await expectNothingWritten(t, requestId);
      // No STANDARD model is approved here: the escalation the policy allows has nowhere to go.
      expect(
        (await t.prisma.aiExecution.findFirstOrThrow()).escalationUsed,
      ).toBe(false);

      scriptWorkGeneration(
        t.provider,
        await request(t, cookie, syllabus),
        valid(),
      );
      await drain(t);
      expect(await t.prisma.work.count()).toBe(1);
      expect(await t.prisma.workQuestion.count()).toBe(5);
    });
  });

  describe("011/US4-2 011/US4-3 011/US4-4 011/US4-6 011/SC-005 resposta que não cumpre o pedido → recusada inteira pelo runner", () => {
    it.each<[string, string, GeneratedWork]>([
      [
        "uma questão a menos",
        "COUNT_MISMATCH",
        { questions: valid().questions.slice(0, 4) },
      ],
      [
        "outra distribuição por tipo",
        "TYPE_MISMATCH",
        validGeneratedWork(
          { ...SHAPE, counts: { OPEN_ANSWER: 0, MULTIPLE_CHOICE: 3, CODE: 2 } },
          MARKER,
        ),
      ],
      [
        "outra dificuldade",
        "DIFFICULTY_MISMATCH",
        patched(OPEN, (question) => ({ ...question, difficulty: "BASIC" })),
      ],
      [
        "uma pegadinha a mais",
        "TRICK_MISMATCH",
        patched(MC + 1, (question) => ({ ...question, isTrickQuestion: true })),
      ],
      [
        "uma pegadinha a menos",
        "TRICK_MISMATCH",
        patched(MC, (question) => ({ ...question, isTrickQuestion: false })),
      ],
      [
        "outra linguagem",
        "LANGUAGE_MISMATCH",
        patched(CODE, code({ language: "Python" })),
      ],
      [
        "resposta esperada vazia",
        "STRUCTURE_INVALID",
        patched(OPEN, (question) => ({ ...question, expectedAnswer: "   " })),
      ],
      [
        "solução esperada vazia",
        "STRUCTURE_INVALID",
        patched(CODE, code({ expectedSolution: " \n " })),
      ],
      [
        "nenhuma alternativa correta",
        "STRUCTURE_INVALID",
        patched(
          MC,
          alternatives([
            ["A", false],
            ["B", false],
            ["C", false],
          ]),
        ),
      ],
      [
        "duas corretas",
        "STRUCTURE_INVALID",
        patched(
          MC,
          alternatives([
            ["A", true],
            ["B", true],
            ["C", false],
          ]),
        ),
      ],
      [
        "2 alternativas",
        "STRUCTURE_INVALID",
        patched(
          MC,
          alternatives([
            ["A", true],
            ["B", false],
          ]),
        ),
      ],
      [
        "alternativas repetidas",
        "STRUCTURE_INVALID",
        patched(
          MC,
          alternatives([
            ["Herança", true],
            ["heranca", false],
            ["C", false],
          ]),
        ),
      ],
      [
        "código sem caso de teste",
        "TEST_CASES_MISSING",
        patched(CODE, code({ testCases: [] })),
      ],
      [
        "enunciados iguais",
        "DUPLICATE_STATEMENT",
        patched(2, (question) => ({
          ...question,
          statement: valid().questions[OPEN]!.statement.toUpperCase(),
        })),
      ],
      [
        "tópico fora da seleção",
        "TOPIC_OUT_OF_SCOPE",
        patched(4, refs(["T5"])),
      ],
      ["questão sem tópico", "TOPIC_OUT_OF_SCOPE", patched(4, refs([]))],
      [
        "questão com 4 tópicos",
        "STRUCTURE_INVALID",
        patched(OPEN, refs(["T1", "T2", "T3", "T4"])),
      ],
      [
        "tópico selecionado sem questão",
        "TOPIC_NOT_COVERED",
        patched(2, refs(["T1"])),
      ],
    ])(
      "%s → FAILED (%s), zero linhas de trabalho, log só com o código",
      async (_, reason, output) => {
        // Several apps in one run share Nest's static logger, so the call is checked, not the stream.
        const warn = vi.spyOn(Logger.prototype, "warn");
        const { requestId, view } = await generate(fakeOutput(output));
        const calls = warn.mock.calls.filter(
          (call) => call[1] === "ai.output_invalid",
        );
        warn.mockRestore();
        expect(view).toMatchObject({
          status: "FAILED",
          failureCode: "AI_OUTPUT_VALIDATION_FAILED",
          workId: null,
        });
        await expectNothingWritten(t, requestId);
        expect(calls).toHaveLength(1);
        expect(calls[0]![0]).toMatchObject({
          errorCode: "AI_OUTPUT_VALIDATION_FAILED",
          errorName: "ProposalRejected",
          rejectReason: reason,
        });
        expect(JSON.stringify(calls)).not.toContain(MARKER);
      },
    );
  });

  describe("011/US4-5 011/FR-028 nota, valores, título, tópicos, ids e situação nunca vêm da resposta", () => {
    it.each<[string, unknown]>([
      [
        "título, descrição e nota total do trabalho",
        {
          ...valid(),
          title: "Título da IA",
          description: "x",
          totalGrade: "100.00",
        },
      ],
      [
        "tópicos, id e situação do trabalho",
        {
          ...valid(),
          topics: ["T1"],
          workId: "3f0e7c7e-8a38-4c55-9d0b-2a4f5c0f6b11",
          status: "APPROVED",
        },
      ],
      [
        "valor da questão",
        patched(OPEN, (question) => ({ ...question, value: "4.00" })),
      ],
      [
        "id e tópicos por id na questão",
        patched(OPEN, (question) => ({
          ...question,
          id: "3f0e7c7e-8a38-4c55-9d0b-2a4f5c0f6b11",
          topicItemIds: [],
        })),
      ],
    ])("%s: o esquema estrito recusa, nada é gravado", async (_, output) => {
      const { requestId, view } = await generate(fakeOutput(output));
      expect(view.status).toBe("FAILED");
      await expectNothingWritten(t, requestId);
    });

    it("uma resposta válida vira o trabalho com título, descrição, nota, tópicos e dificuldade do pedido, valores calculados e DRAFT", async () => {
      const { view } = await generate(fakeOutput(valid()));
      expect(view.status).toBe("GENERATED");
      const work = await t.prisma.work.findUniqueOrThrow({
        where: { id: view.workId! },
        include: {
          topics: { orderBy: { position: "asc" } },
          questions: { orderBy: { position: "asc" } },
        },
      });
      expect(work).toMatchObject({
        title: "Trabalho do pedido",
        description: "Descrição do pedido",
        difficulty: "INTERMEDIATE",
        status: "DRAFT",
        origin: "AI_GENERATED",
      });
      expect(work.totalGrade.toFixed(2)).toBe("5.00");
      expect(work.topics.map((topic) => topic.syllabusItemId)).toEqual(
        syllabus.itemIds.slice(0, 4),
      );
      expect(
        work.questions.map((question) => question.value.toFixed(2)),
      ).toEqual(["1.00", "1.00", "1.00", "1.00", "1.00"]);
    });
  });

  it("011/US4-7 011/FR-029 falha no materialize → rollback total: pedido sem generated_at, sem proposta nem trabalho", async () => {
    const audit = t.get(AuditService);
    const record = audit.record.bind(audit);
    const spy = vi.spyOn(audit, "record").mockImplementation((tx, event) => {
      if (event.type === "work_generation.generated")
        throw new Error(`${MARKER}: falha simulada`);
      return record(tx, event);
    });
    try {
      const requestId = await request(t, cookie, syllabus);
      scriptWorkGeneration(t.provider, requestId, valid());
      await drain(t);
      // The work and its questions were inserted before the audit threw: all of them went back with it.
      await expectNothingWritten(t, requestId);
      expect(await t.prisma.aiExecution.findFirstOrThrow()).toMatchObject({
        status: "FAILED",
        errorCode: "AI_OUTPUT_VALIDATION_FAILED",
      });
      const view = await api(t, { cookie }).get(
        `/api/work-generation-requests/${requestId}`,
      );
      expect(view.body).toMatchObject({
        status: "FAILED",
        generatedAt: null,
        workId: null,
      });
    } finally {
      spy.mockRestore();
    }
  });
});

describe("011/US4-1 escalonamento único da 009 quando a política permite", () => {
  let t: AiTestApp;
  let cookie: string;
  let syllabus: ConfirmedSyllabus;

  beforeAll(async () => {
    t = await createWorkAiApp({ config, modelConfigs: [TEST_WORK_STANDARD] });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    ({ cookie, syllabus } = await setup(t));
  });

  const models = () => t.provider.requests.map((request) => request.model);

  it("fora do esquema no BASIC → uma chamada no STANDARD; a resposta válida vira o trabalho", async () => {
    const requestId = await request(t, cookie, syllabus);
    t.provider.script(
      fakeToolCall(READ_WORK_GENERATION_REQUEST, { requestId }),
      fakeOutput({ unexpected: true }),
    );
    t.provider.scriptFor(STANDARD_MODEL, fakeOutput(valid()));
    await drain(t);
    expect(models()).toEqual([
      TEST_WORK_MODEL_CONFIG.model,
      TEST_WORK_MODEL_CONFIG.model,
      STANDARD_MODEL,
    ]);
    expect(await t.prisma.aiExecution.findFirstOrThrow()).toMatchObject({
      status: "COMPLETED",
      escalationUsed: true,
      escalationFromTier: "BASIC",
      escalationToTier: "STANDARD",
    });
    expect(
      await t.prisma.work.count({
        where: { generationRequestId: requestId, status: "DRAFT" },
      }),
    ).toBe(1);
  });

  it("inválida também no STANDARD → FAILED depois de um só escalonamento, nada gravado", async () => {
    const requestId = await request(t, cookie, syllabus);
    t.provider.script(
      fakeToolCall(READ_WORK_GENERATION_REQUEST, { requestId }),
      fakeOutput({ unexpected: true }),
    );
    t.provider.scriptFor(
      STANDARD_MODEL,
      fakeOutput({ unexpected: true }),
      fakeOutput(valid()),
    );
    await drain(t);
    expect(models()).toEqual([
      TEST_WORK_MODEL_CONFIG.model,
      TEST_WORK_MODEL_CONFIG.model,
      STANDARD_MODEL,
    ]);
    expect(await t.prisma.aiExecution.findFirstOrThrow()).toMatchObject({
      status: "FAILED",
      errorCode: "AI_OUTPUT_VALIDATION_FAILED",
      escalationUsed: true,
    });
    expect(
      await t.prisma.auditEvent.count({
        where: { type: "ai_execution.escalated" },
      }),
    ).toBe(1);
    await expectNothingWritten(t, requestId);
  });
});

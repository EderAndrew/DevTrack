import { randomUUID } from "node:crypto";
import {
  type GeneratedWork,
  GeneratedWorkSchema,
  type WorkQuestionEdit,
  WorkGenerationRequestSchema,
  type WorkTeacherView,
} from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ProposalRejected } from "../../src/modules/work-ai/generation/proposal-rejected";
import { validateGeneratedWork } from "../../src/modules/work-ai/generation/validate-generated-work";
import { validGeneratedWork, type WorkGenerationShape } from "../fixtures/work-generation/valid-work";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, testConfig } from "../helpers/test-app";
import {
  createWorkAiApp,
  requestWork,
  workGenerationRequest,
} from "../helpers/work-ai";
import {
  type ConfirmedSyllabus,
  createConfirmedSyllabus,
  createWork,
  toUpdateBody,
} from "../helpers/works";

/**
 * 011/SC-003: every boundary of the rules — 0/1/10/11 questions, 2/3/5/6 alternatives, 0/1/2
 * correct ones, 0/3/4 trick questions and trick questions above the multiple-choice count (AI
 * only), and a topic that doesn't exist, belongs to another subject or to another teacher — has the
 * expected result on each path: manual creation, edition and the AI's answer (with its request,
 * where the counts, the trick questions and the topics are chosen). A refusal writes nothing, and
 * an edit leaves the work as it was.
 */

const config = {
  rateLimit: {
    ...testConfig().rateLimit,
    aiExecutionsPerMinute: 100,
    aiAgentPerHour: 100,
    workAiPerHour: 100,
  },
};

const openAnswer = (n: number): WorkQuestionEdit => ({
  type: "OPEN_ANSWER",
  statement: `Pergunta ${n}`,
  expectedAnswer: "Resposta",
});
const alternatives = (count: number, correct: number) =>
  Array.from({ length: count }, (_, i) => ({
    text: `Alternativa ${i + 1}`,
    isCorrect: i < correct,
  }));
const multipleChoice = (
  list: { text: string; isCorrect: boolean }[],
): WorkQuestionEdit => ({
  type: "MULTIPLE_CHOICE",
  statement: "Qual palavra-chave declara herança em Java?",
  alternatives: list,
  isTrickQuestion: false,
});
const questions = (count: number) =>
  Array.from({ length: count }, (_, i) => openAnswer(i + 1));

/** [label, question count, accepted]. */
const COUNTS: [string, number, boolean][] = [
  ["0 questões", 0, false],
  ["1 questão", 1, true],
  ["10 questões", 10, true],
  ["11 questões", 11, false],
];

/** [label, alternatives, accepted] — the alternative and correct-answer boundaries. */
const STRUCTURE: [string, { text: string; isCorrect: boolean }[], boolean][] = [
  ["2 alternativas", alternatives(2, 1), false],
  ["3 alternativas", alternatives(3, 1), true],
  ["5 alternativas", alternatives(5, 1), true],
  ["6 alternativas", alternatives(6, 1), false],
  ["0 corretas", alternatives(4, 0), false],
  ["1 correta", alternatives(4, 1), true],
  ["2 corretas", alternatives(4, 2), false],
];

type TopicCase = "inexistente" | "de outra disciplina" | "de outro professor";
const TOPICS: TopicCase[] = [
  "inexistente",
  "de outra disciplina",
  "de outro professor",
];

describe("011/SC-003 casos de fronteira das regras em todos os caminhos", () => {
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
    teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    client = api(t, { cookie });
    syllabus = await createConfirmedSyllabus(t, teacher.id);
  });

  /** A topic selection on `syllabus`' revision whose item is `kind`. */
  async function foreignTopic(
    kind: TopicCase,
  ): Promise<{ syllabusRevisionId: string; syllabusItemIds: string[] }> {
    if (kind === "inexistente")
      return {
        syllabusRevisionId: syllabus.revision.id,
        syllabusItemIds: [randomUUID()],
      };
    const owner =
      kind === "de outro professor"
        ? (await createUser(t, { roles: ["TEACHER"] })).id
        : teacher.id;
    const other = await createConfirmedSyllabus(t, owner);
    return {
      syllabusRevisionId: other.revision.id,
      syllabusItemIds: [other.itemIds[0]!],
    };
  }

  const manual = (overrides: object) => ({
    subjectId: syllabus.subject.id,
    title: "Trabalho de fronteira",
    totalGrade: "10.00",
    topics: null,
    questions: [openAnswer(1)],
    status: "DRAFT",
    ...overrides,
  });

  describe("criação manual (POST /works)", () => {
    it.each(COUNTS)("%s", async (_, count, accepted) => {
      const res = await client.post(
        "/api/works",
        manual({ questions: questions(count) }),
      );
      expect(res.status).toBe(accepted ? 201 : 400);
      expect(await t.prisma.work.count()).toBe(accepted ? 1 : 0);
    });

    it.each(STRUCTURE)("%s", async (_, list, accepted) => {
      const res = await client.post(
        "/api/works",
        manual({ questions: [multipleChoice(list)] }),
      );
      expect(res.status).toBe(accepted ? 201 : 400);
      expect(await t.prisma.workQuestionAlternative.count()).toBe(
        accepted ? list.length : 0,
      );
    });

    it.each(TOPICS)("tópico %s → 404", async (kind) => {
      const res = await client.post(
        "/api/works",
        manual({ topics: await foreignTopic(kind) }),
      );
      expect(res.status).toBe(404);
      expect(await t.prisma.work.count()).toBe(0);
    });
  });

  describe("edição (PUT /works/:id)", () => {
    let work: WorkTeacherView;

    beforeEach(async () => {
      const created = await createWork(t, teacher.id, {
        status: "DRAFT",
        totalGrade: "10.00",
        questions: [{ type: "OPEN_ANSWER" }],
      });
      work = (await client.get(`/api/works/${created.id}`))
        .body as WorkTeacherView;
    });

    async function expectOutcome(
      res: { status: number },
      accepted: boolean,
      refused = 400,
    ) {
      expect(res.status).toBe(accepted ? 200 : refused);
      if (!accepted)
        expect((await client.get(`/api/works/${work.id}`)).body).toEqual(work);
    }

    it.each(COUNTS)("%s", async (_, count, accepted) => {
      const res = await client.put(`/api/works/${work.id}`, {
        ...toUpdateBody(work),
        questions: questions(count),
      });
      await expectOutcome(res, accepted);
    });

    it.each(STRUCTURE)("%s", async (_, list, accepted) => {
      const res = await client.put(`/api/works/${work.id}`, {
        ...toUpdateBody(work),
        questions: [multipleChoice(list)],
      });
      await expectOutcome(res, accepted);
    });

    it.each(TOPICS)("tópico %s → 404", async (kind) => {
      const res = await client.put(`/api/works/${work.id}`, {
        ...toUpdateBody(work),
        topics: await foreignTopic(kind),
      });
      await expectOutcome(res, false, 404);
    });
  });

  describe("resposta da IA (pedido e validação contra ele)", () => {
    const request = (overrides: object = {}) =>
      workGenerationRequest(syllabus, overrides);

    it.each<[string, object, boolean]>([
      ["0 questões", { total: 0 }, false],
      ["1 questão", { total: 1 }, true],
      ["10 questões", { total: 10 }, true],
      ["11 questões", { total: 11 }, false],
      [
        "0 pegadinhas",
        { types: ["MULTIPLE_CHOICE"], total: 3, trickQuestions: 0 },
        true,
      ],
      [
        "3 pegadinhas",
        { types: ["MULTIPLE_CHOICE"], total: 3, trickQuestions: 3 },
        true,
      ],
      [
        "4 pegadinhas",
        { types: ["MULTIPLE_CHOICE"], total: 4, trickQuestions: 4 },
        false,
      ],
      [
        "pegadinhas acima da Múltipla escolha",
        {
          types: ["OPEN_ANSWER", "MULTIPLE_CHOICE"],
          total: 3,
          trickQuestions: 2,
        },
        false,
      ],
      [
        "pegadinha sem Múltipla escolha",
        { types: ["OPEN_ANSWER"], total: 3, trickQuestions: 1 },
        false,
      ],
    ])("pedido com %s", (_, overrides, accepted) => {
      expect(
        WorkGenerationRequestSchema.safeParse(request(overrides)).success,
      ).toBe(accepted);
    });

    it.each(TOPICS)("pedido com tópico %s → 404, nada pedido", async (kind) => {
      const topics = await foreignTopic(kind);
      const res = await requestWork(
        t,
        cookie,
        request({
          syllabusRevisionId: topics.syllabusRevisionId,
          syllabusItemIds: topics.syllabusItemIds,
        }),
      );
      expect(res.status).toBe(404);
      expect(await t.prisma.workGenerationRequest.count()).toBe(0);
      expect(t.provider.requests).toHaveLength(0);
    });

    /** 1 open answer and 1 multiple choice (no trick question), Intermediário, 1 topic. */
    const SHAPE: WorkGenerationShape = {
      difficulty: "INTERMEDIATE",
      counts: { OPEN_ANSWER: 1, MULTIPLE_CHOICE: 1, CODE: 0 },
      trickQuestions: 0,
      language: null,
      topicCount: 1,
    };
    const CONTENT = {
      request: {
        difficulty: SHAPE.difficulty,
        total: 2,
        counts: SHAPE.counts,
        trickQuestions: 0,
        language: null,
      },
      topics: [{ ref: "T1", itemText: "Herança", groupTitle: null }],
    };

    /** The reason a raw AI answer is refused with (the strict schema, then the request), or null. */
    function reason(
      output: unknown,
      content: typeof CONTENT = CONTENT,
    ): string | null {
      const parsed = GeneratedWorkSchema.safeParse(output);
      if (!parsed.success) return "SCHEMA";
      try {
        validateGeneratedWork(parsed.data, content);
        return null;
      } catch (error) {
        expect(error).toBeInstanceOf(ProposalRejected);
        return (error as ProposalRejected).reason;
      }
    }

    it.each<[string, number, string | null]>([
      ["0 questões", 0, "SCHEMA"],
      ["1 questão", 1, null],
      ["10 questões", 10, null],
      ["11 questões", 11, "COUNT_MISMATCH"],
    ])("resposta com %s para um pedido de 1 ou 10", (_, count, expected) => {
      const total = count === 11 ? 10 : Math.max(count, 1);
      const shape = {
        ...SHAPE,
        counts: { OPEN_ANSWER: total, MULTIPLE_CHOICE: 0, CODE: 0 },
      };
      const content = {
        ...CONTENT,
        request: { ...CONTENT.request, total, counts: shape.counts },
      };
      const base = validGeneratedWork({
        ...shape,
        counts: { ...shape.counts, OPEN_ANSWER: Math.max(count, 1) },
      });
      const output: GeneratedWork = {
        questions: base.questions.slice(0, count),
      };
      expect(reason(output, content)).toBe(expected);
    });

    it.each(STRUCTURE)("resposta com %s", (_, list, accepted) => {
      const work = validGeneratedWork(SHAPE);
      const output = {
        questions: work.questions.map((question) =>
          question.type === "MULTIPLE_CHOICE"
            ? { ...question, alternatives: list }
            : question,
        ),
      };
      expect(reason(output)).toBe(accepted ? null : "STRUCTURE_INVALID");
    });

    it.each<[string, number, number, string | null]>([
      ["0 pegadinhas pedidas e 0 na resposta", 0, 0, null],
      ["3 pegadinhas pedidas e 3 na resposta", 3, 3, null],
      ["3 pedidas e 4 na resposta", 3, 4, "TRICK_MISMATCH"],
    ])("%s", (_, requested, answered, expected) => {
      const shape = {
        ...SHAPE,
        counts: { OPEN_ANSWER: 0, MULTIPLE_CHOICE: 4, CODE: 0 },
        trickQuestions: requested,
      };
      const content = {
        ...CONTENT,
        request: {
          ...CONTENT.request,
          total: 4,
          counts: shape.counts,
          trickQuestions: requested,
        },
      };
      const work = validGeneratedWork(shape);
      const output = {
        questions: work.questions.map((question, index) => ({
          ...question,
          isTrickQuestion: index < answered,
        })),
      };
      expect(reason(output, content)).toBe(expected);
    });

    it.each<[string, string[]]>([
      ["tópico fora da seleção", ["T2"]],
      ["texto no lugar do tópico", ["Herança"]],
    ])("resposta com %s → TOPIC_OUT_OF_SCOPE", (_, refs) => {
      const work = validGeneratedWork(SHAPE);
      expect(
        reason({
          questions: work.questions.map((question) => ({
            ...question,
            topicRefs: refs,
          })),
        }),
      ).toBe("TOPIC_OUT_OF_SCOPE");
    });
  });
});

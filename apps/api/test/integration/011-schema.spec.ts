import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { type ConfirmedSyllabus, createConfirmedSyllabus, createWork, createWorkGenerationRequest, workLanguageId } from "../helpers/works";

/**
 * 011 data-model.md, research W2, W3, W7: the database refuses, by itself, what the work rules
 * forbid — rows written by direct SQL, without the API or its contracts in the way (constitution V).
 */

/** Casts of the typed columns, so the values go in as plain text parameters. */
const CASTS: Record<string, string> = {
  id: "uuid",
  teacher_id: "uuid",
  subject_id: "uuid",
  syllabus_revision_id: "uuid",
  syllabus_item_id: "uuid",
  generation_request_id: "uuid",
  work_id: "uuid",
  question_id: "uuid",
  request_id: "uuid",
  language_id: "uuid",
  idempotency_key: "uuid",
  type: "work_question_type",
  grading_strategy: "work_grading_strategy",
  difficulty: "work_difficulty",
  origin: "work_origin",
  status: "work_status",
  visibility: "work_test_case_visibility",
  total_grade: "numeric",
  value: "numeric",
};

type Row = Record<string, string | number | boolean | null>;
type Statement = { table: string; row: Row };

function insertSql({ table, row }: Statement): [string, unknown[]] {
  const columns = Object.keys(row);
  const values = columns.map((column, index) => `$${index + 1}${CASTS[column] ? `::${CASTS[column]}` : ""}`);
  return [
    `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${values.join(", ")})`,
    columns.map((column) => row[column]),
  ];
}

const STRATEGY = { OPEN_ANSWER: "AI_REVIEW", MULTIPLE_CHOICE: "EXACT_MATCH", CODE: "TEST_CASES" } as const;
type QuestionType = keyof typeof STRATEGY;

describe("011/FR-002 011/FR-003 011/FR-006 011/FR-011 011/FR-036 regras do banco de trabalhos garantidas pelo PostgreSQL", () => {
  let t: TestApp;
  let teacherId: string;
  let syllabus: ConfirmedSyllabus;
  let other: ConfirmedSyllabus;
  let java: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacherId = (await createUser(t, { roles: ["TEACHER"] })).id;
    syllabus = await createConfirmedSyllabus(t, teacherId, {
      groups: [{ title: "Tópicos", items: Array.from({ length: 11 }, (_, index) => `Tópico ${index + 1}`) }],
    });
    other = await createConfirmedSyllabus(t, teacherId);
    java = await workLanguageId(t, "java");
  });

  /** Runs the statements in one transaction, so the deferred triggers check them at commit. */
  const write = (...statements: Statement[]) =>
    t.prisma.$transaction(async (tx) => {
      for (const statement of statements) {
        const [sql, params] = insertSql(statement);
        await tx.$executeRawUnsafe(sql, ...params);
      }
    });

  const work = (id: string, fields: Row = {}): Statement => ({
    table: "works",
    row: {
      id,
      teacher_id: teacherId,
      subject_id: syllabus.subject.id,
      title: "Trabalho",
      title_search_key: "trabalho",
      total_grade: "1.00",
      question_count: 1,
      origin: "MANUAL",
      status: "DRAFT",
      updated_at: new Date().toISOString(),
      ...fields,
    },
  });

  const question = (workId: string, position: number, type: QuestionType, fields: Row = {}): Statement & { id: string } => {
    const id = randomUUID();
    return {
      id,
      table: "work_questions",
      row: {
        id,
        work_id: workId,
        position,
        type,
        grading_strategy: STRATEGY[type],
        statement: `Enunciado ${position}`,
        statement_search_key: `enunciado ${position}`,
        value: "1.00",
        expected_answer: type === "OPEN_ANSWER" ? "Resposta" : null,
        expected_solution: type === "CODE" ? "class A {}" : null,
        language_id: type === "CODE" ? java : null,
        updated_at: new Date().toISOString(),
        ...fields,
      },
    };
  };

  const alternatives = (questionId: string, texts: string[], correct: number[] = [0]): Statement[] =>
    texts.map((text, position) => ({
      table: "work_question_alternatives",
      row: { question_id: questionId, position, text, is_correct: correct.includes(position) },
    }));

  const testCases = (questionId: string, count: number): Statement[] =>
    Array.from({ length: count }, (_, position) => ({
      table: "work_question_test_cases",
      row: { question_id: questionId, position, input: `${position}`, expected_output: `${position}`, visibility: "PUBLIC" },
    }));

  const topic = (workId: string, itemId: string, position: number, revisionId = syllabus.revision.id): Statement => ({
    table: "work_topics",
    row: { work_id: workId, syllabus_item_id: itemId, syllabus_revision_id: revisionId, position },
  });

  const questionTopic = (questionId: string, workId: string, itemId: string): Statement => ({
    table: "work_question_topics",
    row: { question_id: questionId, work_id: workId, syllabus_item_id: itemId },
  });

  /** A valid multiple-choice work of `count` questions worth `value` each. */
  const multipleChoiceWork = (count: number, value = "0.10", fields: Row = {}) => {
    const id = randomUUID();
    const questions = Array.from({ length: count }, (_, position) => question(id, position, "MULTIPLE_CHOICE", { value }));
    return {
      id,
      questions,
      statements: [
        work(id, { question_count: count, total_grade: (Number(value) * count).toFixed(2), ...fields }),
        ...questions.flatMap((q) => [q, ...alternatives(q.id, ["A", "B", "C"])]),
      ],
    };
  };

  const count = () => t.prisma.work.count();

  it("aceita um trabalho válido com tópicos, as três questões e seus tópicos", async () => {
    const id = randomUUID();
    const open = question(id, 0, "OPEN_ANSWER", { value: "0.17" });
    const choice = question(id, 1, "MULTIPLE_CHOICE", { value: "0.17", is_trick_question: true });
    const code = question(id, 2, "CODE", { value: "0.16" });
    await write(
      work(id, { question_count: 3, total_grade: "0.50", syllabus_revision_id: syllabus.revision.id }),
      topic(id, syllabus.itemIds[0]!, 0),
      topic(id, syllabus.itemIds[1]!, 1),
      open,
      choice,
      ...alternatives(choice.id, ["A", "B", "C", "D", "E"], [4]),
      code,
      ...testCases(code.id, 20),
      questionTopic(open.id, id, syllabus.itemIds[0]!),
      questionTopic(code.id, id, syllabus.itemIds[1]!),
    );
    expect(await count()).toBe(1);
  });

  describe("011/FR-011 nota exata", () => {
    it("recusa soma dos valores diferente da nota total", async () => {
      const { statements } = multipleChoiceWork(3, "0.17", { total_grade: "0.50" });
      await expect(write(...statements)).rejects.toThrow(/add up to/);
      expect(await count()).toBe(0);
    });

    it("recusa nota 0.00 e 100.01", async () => {
      for (const grade of ["0.00", "100.01"]) {
        const { statements } = multipleChoiceWork(1, "0.10", { total_grade: grade });
        await expect(write(...statements), grade).rejects.toThrow(/works_total_grade_chk/);
      }
      expect(await count()).toBe(0);
    });

    it("recusa menos de 0,01 por questão e valor de questão 0", async () => {
      const { statements } = multipleChoiceWork(2, "0.00", { total_grade: "0.01" });
      await expect(write(...statements)).rejects.toThrow(/works_total_grade_chk|work_questions_value_chk/);
      expect(await count()).toBe(0);
    });
  });

  describe("011/FR-002 1 a 10 questões em posições contíguas", () => {
    it("recusa 0 e 11 questões", async () => {
      await expect(write(work(randomUUID(), { question_count: 1 }))).rejects.toThrow(/needs 1 questions/);
      await expect(write(work(randomUUID(), { question_count: 0 }))).rejects.toThrow(/works_question_count_chk/);
      const { statements } = multipleChoiceWork(11, "0.10");
      await expect(write(...statements)).rejects.toThrow(/works_question_count_chk/);
      expect(await count()).toBe(0);
    });

    it("recusa posições com buraco", async () => {
      const id = randomUUID();
      const first = question(id, 0, "OPEN_ANSWER", { value: "0.50" });
      const third = question(id, 2, "OPEN_ANSWER", { value: "0.50" });
      await expect(write(work(id, { question_count: 2 }), first, third)).rejects.toThrow(/contiguous positions/);
      expect(await count()).toBe(0);
    });

    it("aceita trocar posições dentro da transação (restrição adiável)", async () => {
      const { id, questions, statements } = multipleChoiceWork(2, "0.50");
      await write(...statements);
      await t.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`UPDATE "work_questions" SET "position" = 1 WHERE "id" = ${questions[0]!.id}::uuid`;
        await tx.$executeRaw`UPDATE "work_questions" SET "position" = 0 WHERE "id" = ${questions[1]!.id}::uuid`;
      });
      const positions = await t.prisma.workQuestion.findMany({ where: { workId: id }, orderBy: { position: "asc" } });
      expect(positions.map((row) => row.id)).toEqual([questions[1]!.id, questions[0]!.id]);
    });
  });

  describe("011/FR-003 múltipla escolha, respostas e casos de teste por tipo", () => {
    const choiceWork = (texts: string[], correct: number[] = [0]) => {
      const id = randomUUID();
      const q = question(id, 0, "MULTIPLE_CHOICE");
      return [work(id), q, ...alternatives(q.id, texts, correct)];
    };

    it("recusa 2 e 6 alternativas", async () => {
      await expect(write(...choiceWork(["A", "B"]))).rejects.toThrow(/3 to 5 distinct alternatives/);
      await expect(write(...choiceWork(["A", "B", "C", "D", "E", "F"]))).rejects.toThrow(/3 to 5 distinct alternatives/);
      expect(await count()).toBe(0);
    });

    it("recusa nenhuma e duas alternativas corretas", async () => {
      await expect(write(...choiceWork(["A", "B", "C"], []))).rejects.toThrow(/exactly one correct/);
      await expect(write(...choiceWork(["A", "B", "C"], [0, 2]))).rejects.toThrow(/work_question_alternatives_one_correct_key|Unique constraint/);
      expect(await count()).toBe(0);
    });

    it("recusa textos repetidos depois de normalizar espaços e maiúsculas", async () => {
      await expect(write(...choiceWork(["Herança", "  herança ", "Polimorfismo"]))).rejects.toThrow(/distinct alternatives/);
      expect(await count()).toBe(0);
    });

    it("recusa alternativa em questão aberta e caso de teste em múltipla escolha", async () => {
      const openId = randomUUID();
      const open = question(openId, 0, "OPEN_ANSWER");
      await expect(write(work(openId), open, ...alternatives(open.id, ["A", "B", "C"]))).rejects.toThrow(/cannot have alternatives/);

      const choiceId = randomUUID();
      const choice = question(choiceId, 0, "MULTIPLE_CHOICE");
      await expect(write(work(choiceId), choice, ...alternatives(choice.id, ["A", "B", "C"]), ...testCases(choice.id, 1))).rejects.toThrow(
        /cannot have test cases/,
      );
      expect(await count()).toBe(0);
    });

    it("recusa mais de 20 casos de teste numa questão de código", async () => {
      const id = randomUUID();
      const code = question(id, 0, "CODE");
      await expect(write(work(id), code, ...testCases(code.id, 21))).rejects.toThrow(/more than 20 test cases/);
      expect(await count()).toBe(0);
    });

    it("recusa gabarito ausente e pegadinha fora da múltipla escolha", async () => {
      const id = randomUUID();
      await expect(write(work(id), question(id, 0, "OPEN_ANSWER", { expected_answer: null }))).rejects.toThrow(/work_questions_open_answer_chk/);
      await expect(write(work(id), question(id, 0, "CODE", { language_id: null }))).rejects.toThrow(/work_questions_code_chk/);
      await expect(write(work(id), question(id, 0, "OPEN_ANSWER", { is_trick_question: true }))).rejects.toThrow(
        /work_questions_trick_question_chk/,
      );
      expect(await count()).toBe(0);
    });
  });

  describe("011/FR-036 estratégia de correção fixada pelo tipo", () => {
    it("recusa estratégia trocada (múltipla escolha com AI_REVIEW)", async () => {
      const id = randomUUID();
      const q = question(id, 0, "MULTIPLE_CHOICE", { grading_strategy: "AI_REVIEW" });
      await expect(write(work(id), q, ...alternatives(q.id, ["A", "B", "C"]))).rejects.toThrow(/work_questions_grading_strategy_chk/);
      expect(await count()).toBe(0);
    });
  });

  describe("011/FR-006 tópicos da revisão do trabalho", () => {
    it("recusa tópico de outra revisão no trabalho", async () => {
      const { id, statements } = multipleChoiceWork(1, "1.00", { syllabus_revision_id: syllabus.revision.id });
      await expect(write(...statements, topic(id, other.itemIds[0]!, 0))).rejects.toThrow(/work_topics_syllabus_item_id_syllabus_revision_id_fkey|Foreign key/);
      await expect(write(...statements, topic(id, other.itemIds[0]!, 0, other.revision.id))).rejects.toThrow(
        /work_topics_work_id_syllabus_revision_id_fkey|Foreign key/,
      );
      expect(await count()).toBe(0);
    });

    it("recusa revisão sem tópico e tópico sem revisão", async () => {
      const { statements } = multipleChoiceWork(1, "1.00", { syllabus_revision_id: syllabus.revision.id });
      await expect(write(...statements)).rejects.toThrow(/revision iff it has one/);
      const bare = multipleChoiceWork(1, "1.00");
      await expect(write(...bare.statements, topic(bare.id, syllabus.itemIds[0]!, 0))).rejects.toThrow(/Foreign key|fkey/);
      expect(await count()).toBe(0);
    });

    it("recusa 11 tópicos num trabalho", async () => {
      const { id, statements } = multipleChoiceWork(1, "1.00", { syllabus_revision_id: syllabus.revision.id });
      const topics = syllabus.itemIds.slice(0, 11).map((itemId, position) => topic(id, itemId, position));
      await expect(write(...statements, ...topics)).rejects.toThrow(/0 to 10 topics/);
      expect(await count()).toBe(0);
    });

    it("recusa tópico de questão que não é do trabalho", async () => {
      const { id, questions, statements } = multipleChoiceWork(1, "1.00", { syllabus_revision_id: syllabus.revision.id });
      await expect(write(...statements, topic(id, syllabus.itemIds[0]!, 0), questionTopic(questions[0]!.id, id, syllabus.itemIds[1]!))).rejects.toThrow(
        /work_question_topics_work_id_syllabus_item_id_fkey|Foreign key/,
      );
      expect(await count()).toBe(0);
    });

    it("recusa 4 tópicos numa questão", async () => {
      const { id, questions, statements } = multipleChoiceWork(1, "1.00", { syllabus_revision_id: syllabus.revision.id });
      const items = syllabus.itemIds.slice(0, 4);
      await expect(
        write(
          ...statements,
          ...items.map((itemId, position) => topic(id, itemId, position)),
          ...items.map((itemId) => questionTopic(questions[0]!.id, id, itemId)),
        ),
      ).rejects.toThrow(/more than 3 topics/);
      expect(await count()).toBe(0);
    });
  });

  describe("011/FR-002 origem e tipo imutáveis; trabalho gerado completo", () => {
    it("recusa mudar a origem do trabalho e o tipo da questão", async () => {
      const created = await createWork(t, teacherId);
      await expect(t.prisma.$executeRaw`UPDATE "works" SET "origin" = 'AI_GENERATED' WHERE "id" = ${created.id}::uuid`).rejects.toThrow(
        /origin is immutable/,
      );
      await expect(
        t.prisma.$executeRaw`UPDATE "work_questions" SET "type" = 'OPEN_ANSWER' WHERE "id" = ${created.questions[0]!.id}::uuid`,
      ).rejects.toThrow(/type and work are immutable/);
    });

    it("recusa AI_GENERATED sem dificuldade ou sem pedido", async () => {
      const request = await createWorkGenerationRequest(t, teacherId, syllabus);
      const ai = { origin: "AI_GENERATED", syllabus_revision_id: syllabus.revision.id };
      const noDifficulty = multipleChoiceWork(1, "1.00", { ...ai, generation_request_id: request.id });
      await expect(write(...noDifficulty.statements, topic(noDifficulty.id, syllabus.itemIds[0]!, 0))).rejects.toThrow(/works_origin_chk/);
      const noRequest = multipleChoiceWork(1, "1.00", { ...ai, difficulty: "BASIC" });
      await expect(write(...noRequest.statements, topic(noRequest.id, syllabus.itemIds[0]!, 0))).rejects.toThrow(/works_origin_chk/);
      const valid = multipleChoiceWork(1, "1.00", { ...ai, difficulty: "BASIC", generation_request_id: request.id });
      await write(...valid.statements, topic(valid.id, syllabus.itemIds[0]!, 0));
      expect(await count()).toBe(1);
    });

    it("recusa trabalho gerado aprovado sem revisão humana", async () => {
      const request = await createWorkGenerationRequest(t, teacherId, syllabus);
      const { id, statements } = multipleChoiceWork(1, "1.00", {
        origin: "AI_GENERATED",
        status: "APPROVED",
        difficulty: "BASIC",
        syllabus_revision_id: syllabus.revision.id,
        generation_request_id: request.id,
      });
      await expect(write(...statements, topic(id, syllabus.itemIds[0]!, 0))).rejects.toThrow(/works_ai_approved_chk/);
    });
  });

  describe("011/FR-021 pedido de geração", () => {
    const request = (fields: Row = {}, topics = 1): Statement[] => {
      const id = randomUUID();
      return [
        {
          table: "work_generation_requests",
          row: {
            id,
            teacher_id: teacherId,
            subject_id: syllabus.subject.id,
            syllabus_revision_id: syllabus.revision.id,
            title: "Pedido",
            difficulty: "BASIC",
            total_grade: "10.00",
            requested_quantity: 3,
            open_answer_quantity: 1,
            multiple_choice_quantity: 2,
            code_quantity: 0,
            trick_question_quantity: 0,
            distribution: "AUTO",
            idempotency_key: randomUUID(),
            ...fields,
          },
        },
        ...syllabus.itemIds.slice(0, topics).map((itemId, position) => ({
          table: "work_generation_request_topics",
          row: { request_id: id, syllabus_item_id: itemId, syllabus_revision_id: syllabus.revision.id, position },
        })),
      ];
    };
    const requests = () => t.prisma.workGenerationRequest.count();

    it("aceita um pedido válido", async () => {
      await write(...request());
      expect(await requests()).toBe(1);
    });

    it("recusa soma por tipo diferente do total e pegadinhas acima da múltipla escolha", async () => {
      await expect(write(...request({ open_answer_quantity: 2 }))).rejects.toThrow(/work_generation_requests_quantity_chk/);
      await expect(write(...request({ trick_question_quantity: 3 }))).rejects.toThrow(/work_generation_requests_trick_chk/);
      expect(await requests()).toBe(0);
    });

    it("recusa código sem linguagem, nenhum tópico e mais de 3 tópicos por questão", async () => {
      await expect(write(...request({ open_answer_quantity: 0, code_quantity: 1 }))).rejects.toThrow(/work_generation_requests_language_chk/);
      await expect(write(...request({}, 0))).rejects.toThrow(/1 to 10 topics/);
      await expect(
        write(...request({ requested_quantity: 1, open_answer_quantity: 1, multiple_choice_quantity: 0, total_grade: "1.00" }, 4)),
      ).rejects.toThrow(/at most 3 per question/);
      expect(await requests()).toBe(0);
    });
  });
});

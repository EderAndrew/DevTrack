import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../helpers/factories";
import { type ConfirmedTopic, createConfirmedTopic, createExercise, createGenerationBatch, languageId } from "../helpers/exercises";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 010 data-model.md, research X2: the database refuses, by itself, what the exercise rules forbid —
 * rows written by direct SQL, without the API or its contracts in the way (constitution V).
 */

/** Casts of the enum columns, so the values go in as plain text parameters. */
const CASTS: Record<string, string> = {
  type: "exercise_type",
  difficulty: "exercise_difficulty",
  cognitive_objective: "cognitive_objective",
  origin: "exercise_origin",
  status: "exercise_status",
  archived_from_status: "exercise_status",
  teacher_id: "uuid",
  language_id: "uuid",
  syllabus_item_id: "uuid",
  syllabus_revision_id: "uuid",
  generation_batch_id: "uuid",
  generation_item_id: "uuid",
  exercise_id: "uuid",
  id: "uuid",
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

describe("010/FR-004 010/FR-009 010/FR-016 regras do banco de exercícios garantidas pelo PostgreSQL", () => {
  let t: TestApp;
  let teacherId: string;
  let topic: ConfirmedTopic;
  let java: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacherId = (await createUser(t, { roles: ["TEACHER"] })).id;
    topic = await createConfirmedTopic(t, teacherId);
    java = await languageId(t, "java");
  });

  /** Runs the statements in one transaction, so the deferred trigger checks them at commit. */
  const write = (...statements: Statement[]) =>
    t.prisma.$transaction(async (tx) => {
      for (const statement of statements) {
        const [sql, params] = insertSql(statement);
        await tx.$executeRawUnsafe(sql, ...params);
      }
    });

  const exercise = (id: string, fields: Row = {}): Statement => ({
    table: "exercises",
    row: {
      id,
      teacher_id: teacherId,
      type: "MULTIPLE_CHOICE",
      difficulty: "BASIC",
      cognitive_objective: "UNDERSTAND",
      origin: "MANUAL",
      status: "DRAFT",
      statement: "Qual é a saída?",
      statement_search_key: "qual e a saida?",
      explanation: "Porque sim.",
      updated_at: new Date().toISOString(),
      ...fields,
    },
  });
  const alternatives = (exerciseId: string, texts: string[], correct: number[] = [0]): Statement[] =>
    texts.map((text, position) => ({
      table: "exercise_alternatives",
      row: { exercise_id: exerciseId, position, text, is_correct: correct.includes(position) },
    }));
  const multipleChoice = (texts: string[], correct: number[] = [0]) => {
    const id = randomUUID();
    return [exercise(id), ...alternatives(id, texts, correct)];
  };

  const count = () => t.prisma.exercise.count();

  describe("010/FR-004 Múltipla escolha", () => {
    it("aceita 3 e 5 alternativas com exatamente uma correta", async () => {
      await write(...multipleChoice(["A", "B", "C"]));
      await write(...multipleChoice(["A", "B", "C", "D", "E"], [4]));
      expect(await count()).toBe(2);
    });

    it("recusa 2 e 6 alternativas", async () => {
      await expect(write(...multipleChoice(["A", "B"]))).rejects.toThrow(/3 to 5 distinct alternatives/);
      await expect(write(...multipleChoice(["A", "B", "C", "D", "E", "F"]))).rejects.toThrow(/3 to 5 distinct alternatives/);
      expect(await count()).toBe(0);
    });

    it("recusa nenhuma alternativa correta e duas corretas", async () => {
      await expect(write(...multipleChoice(["A", "B", "C"], []))).rejects.toThrow(/exactly one correct/);
      await expect(write(...multipleChoice(["A", "B", "C"], [0, 2]))).rejects.toThrow(/exercise_alternatives_one_correct_key|Unique constraint/);
      expect(await count()).toBe(0);
    });

    it("recusa textos repetidos depois de normalizar espaços e maiúsculas", async () => {
      await expect(write(...multipleChoice(["Herança", "  herança ", "Polimorfismo"]))).rejects.toThrow(/distinct alternatives/);
      expect(await count()).toBe(0);
    });

    it("recusa Múltipla escolha sem alternativas e outro tipo com alternativas", async () => {
      await expect(write(exercise(randomUUID()))).rejects.toThrow(/3 to 5 distinct alternatives/);
      const open = randomUUID();
      await expect(
        write(exercise(open, { type: "OPEN_ANSWER", expected_answer: "resposta" }), ...alternatives(open, ["A", "B", "C"])),
      ).rejects.toThrow(/cannot have alternatives/);
      expect(await count()).toBe(0);
    });

    it("recusa, no commit, remover alternativas de um exercício válido abaixo de 3", async () => {
      const created = await createExercise(t, teacherId);
      await expect(
        t.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`DELETE FROM "exercise_alternatives" WHERE "exercise_id" = ${created.id}::uuid AND "position" = 2`;
        }),
      ).rejects.toThrow(/3 to 5 distinct alternatives/);
      expect(await t.prisma.exerciseAlternative.count({ where: { exerciseId: created.id } })).toBe(3);
    });

    it("pegadinha só em Múltipla escolha", async () => {
      await expect(
        write(exercise(randomUUID(), { type: "OPEN_ANSWER", expected_answer: "resposta", is_trick_question: true })),
      ).rejects.toThrow(/exercises_trick_question_chk/);
    });
  });

  describe("010/FR-005 campos de cada tipo", () => {
    it("código exige instruções, solução esperada e linguagem", async () => {
      const code = { type: "CODE", instructions: "Implemente", expected_solution: "class A {}" };
      await expect(write(exercise(randomUUID(), code))).rejects.toThrow(/exercises_code_chk/);
      await write(exercise(randomUUID(), { ...code, language_id: java }));
      await expect(write(exercise(randomUUID(), { ...code, language_id: java, instructions: null }))).rejects.toThrow(/exercises_code_chk/);
      expect(await count()).toBe(1);
    });

    it("pergunta e resposta exige resposta esperada e não aceita campos de código", async () => {
      await expect(write(exercise(randomUUID(), { type: "OPEN_ANSWER" }))).rejects.toThrow(/exercises_open_answer_chk/);
      await expect(
        write(exercise(randomUUID(), { type: "OPEN_ANSWER", expected_answer: "r", starter_code: "x" })),
      ).rejects.toThrow(/exercises_code_chk/);
    });
  });

  describe("010/FR-009 origem", () => {
    it("AI_GENERATED exige lote e tópico; MANUAL não tem lote", async () => {
      const batch = await createGenerationBatch(t, teacherId, topic);
      const ai = { type: "OPEN_ANSWER", expected_answer: "r", origin: "AI_GENERATED" };
      await expect(write(exercise(randomUUID(), ai))).rejects.toThrow(/exercises_origin_chk/);
      await expect(
        write(exercise(randomUUID(), { ...ai, generation_batch_id: batch.id, generation_item_id: randomUUID() })),
      ).rejects.toThrow(/exercises_origin_chk/);
      await expect(
        write(exercise(randomUUID(), { ...ai, syllabus_item_id: topic.itemId, generation_batch_id: batch.id })),
      ).rejects.toThrow(/exercises_origin_chk/);
      await expect(
        write(
          exercise(randomUUID(), {
            type: "OPEN_ANSWER",
            expected_answer: "r",
            generation_batch_id: batch.id,
            generation_item_id: randomUUID(),
          }),
        ),
      ).rejects.toThrow(/exercises_origin_chk/);
      await write(
        exercise(randomUUID(), { ...ai, syllabus_item_id: topic.itemId, generation_batch_id: batch.id, generation_item_id: randomUUID() }),
      );
      expect(await count()).toBe(1);
    });

    it("a origem e o tipo nunca mudam, mesmo numa edição", async () => {
      const created = await createExercise(t, teacherId, { type: "OPEN_ANSWER" });
      await expect(
        t.prisma.$executeRaw`UPDATE "exercises" SET "origin" = 'AI_GENERATED' WHERE "id" = ${created.id}::uuid`,
      ).rejects.toThrow(/origin and type are immutable/);
      await expect(
        t.prisma.$executeRaw`UPDATE "exercises" SET "type" = 'CODE' WHERE "id" = ${created.id}::uuid`,
      ).rejects.toThrow(/origin and type are immutable/);
      await t.prisma.$executeRaw`UPDATE "exercises" SET "statement" = 'Editado', "human_edited" = true WHERE "id" = ${created.id}::uuid`;
      expect((await t.prisma.exercise.findUniqueOrThrow({ where: { id: created.id } })).origin).toBe("MANUAL");
    });

    it("exercício de IA aprovado exige revisão humana registrada", async () => {
      const batch = await createGenerationBatch(t, teacherId, topic);
      await expect(
        write(
          exercise(randomUUID(), {
            type: "OPEN_ANSWER",
            expected_answer: "r",
            origin: "AI_GENERATED",
            status: "APPROVED",
            syllabus_item_id: topic.itemId,
            generation_batch_id: batch.id,
            generation_item_id: randomUUID(),
          }),
        ),
      ).rejects.toThrow(/exercises_ai_approved_chk/);
    });
  });

  describe("010/FR-010 situação arquivada", () => {
    it("ARCHIVED guarda a situação anterior, e só ARCHIVED a guarda", async () => {
      const open = { type: "OPEN_ANSWER", expected_answer: "r" };
      await expect(write(exercise(randomUUID(), { ...open, status: "ARCHIVED" }))).rejects.toThrow(/exercises_archived_chk/);
      await expect(
        write(exercise(randomUUID(), { ...open, status: "APPROVED", archived_from_status: "DRAFT" })),
      ).rejects.toThrow(/exercises_archived_chk/);
      await write(exercise(randomUUID(), { ...open, status: "ARCHIVED", archived_from_status: "APPROVED" }));
      expect(await count()).toBe(1);
    });
  });

  describe("010/FR-016 010/FR-019 010/FR-020 lote de geração", () => {
    it("recusa soma por tipo diferente do total e total fora de 3 a 10", async () => {
      await expect(
        t.prisma.$executeRaw`UPDATE "exercise_generation_batches" SET "requested_quantity" = 6 WHERE "id" = ${(await createGenerationBatch(t, teacherId, topic)).id}::uuid`,
      ).rejects.toThrow(/exercise_generation_batches_quantity_chk/);
      await expect(createGenerationBatch(t, teacherId, topic, { counts: { OPEN_ANSWER: 1, MULTIPLE_CHOICE: 1, CODE: 0 } })).rejects.toThrow(
        /exercise_generation_batches_quantity_chk/,
      );
      await expect(createGenerationBatch(t, teacherId, topic, { counts: { OPEN_ANSWER: 5, MULTIPLE_CHOICE: 5, CODE: 1 } })).rejects.toThrow(
        /exercise_generation_batches_quantity_chk/,
      );
    });

    it("pegadinhas: até 3 e nunca acima da Múltipla escolha", async () => {
      await createGenerationBatch(t, teacherId, topic, { counts: { OPEN_ANSWER: 0, MULTIPLE_CHOICE: 5, CODE: 0 }, trickQuestions: 3 });
      await expect(
        createGenerationBatch(t, teacherId, topic, { counts: { OPEN_ANSWER: 3, MULTIPLE_CHOICE: 2, CODE: 0 }, trickQuestions: 3 }),
      ).rejects.toThrow(/exercise_generation_batches_trick_chk/);
      await expect(
        createGenerationBatch(t, teacherId, topic, { counts: { OPEN_ANSWER: 0, MULTIPLE_CHOICE: 5, CODE: 0 }, trickQuestions: 4 }),
      ).rejects.toThrow(/exercise_generation_batches_trick_chk/);
      await expect(
        createGenerationBatch(t, teacherId, topic, { counts: { OPEN_ANSWER: 3, MULTIPLE_CHOICE: 0, CODE: 0 }, trickQuestions: 1 }),
      ).rejects.toThrow(/exercise_generation_batches_trick_chk/);
    });

    it("linguagem se e somente se houver código", async () => {
      await expect(createGenerationBatch(t, teacherId, topic, { languageId: null })).rejects.toThrow(
        /exercise_generation_batches_language_chk/,
      );
      await expect(
        createGenerationBatch(t, teacherId, topic, { counts: { OPEN_ANSWER: 3, MULTIPLE_CHOICE: 0, CODE: 0 }, languageId: java }),
      ).rejects.toThrow(/exercise_generation_batches_language_chk/);
    });

    it("o tópico pertence à revisão do lote", async () => {
      const other = await createConfirmedTopic(t, teacherId);
      await expect(
        createGenerationBatch(t, teacherId, { itemId: other.itemId, revision: topic.revision, languageId: topic.languageId }),
      ).rejects.toThrow(/exercise_generation_batches_syllabus_item_id_syllabus_revi_fkey|Foreign key constraint/);
    });
  });

  it("010/FR-005 o catálogo de linguagens vem semeado com as 13 entradas ativas", async () => {
    const languages = await t.prisma.programmingLanguage.findMany({ orderBy: { name: "asc" } });
    expect(languages.map((language) => language.name)).toEqual([
      "Angular",
      "C",
      "C++",
      "Go",
      "HTML & CSS",
      "Java",
      "JavaScript",
      "Nest",
      "Node",
      "PHP",
      "Python",
      "Rust",
      "TypeScript",
    ]);
    expect(languages.every((language) => language.active)).toBe(true);
    expect(languages.find((language) => language.key === "node")?.aliases).toEqual(["node.js", "nodejs"]);
  });
});

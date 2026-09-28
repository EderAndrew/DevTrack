import { randomUUID } from "node:crypto";
import type {
  CognitiveObjective,
  Exercise,
  ExerciseAlternative,
  ExerciseDifficulty,
  ExerciseGenerationBatch,
  ExerciseOrigin,
  ExerciseStatus,
  ExerciseType,
  Subject,
  SubjectStatus,
  SyllabusDocument,
  SyllabusRevision,
} from "../../src/generated/prisma/client";
import { searchKey } from "../../src/platform/text/search-key";
import { createConfirmedRevision, createSubject, createSyllabusDocument } from "./factories";
import type { TestApp } from "./test-app";

// ── 010: exercise bank fixtures, written straight to the database ─────────────────────────

/** Id of a seeded programming language by its key (`java`, `python`, `html-css`…). */
export async function languageId(t: TestApp, key: string): Promise<string> {
  return (await t.prisma.programmingLanguage.findUniqueOrThrow({ where: { key }, select: { id: true } })).id;
}

export interface ConfirmedTopic {
  subject: Subject;
  document: SyllabusDocument;
  revision: SyllabusRevision;
  groupId: string;
  /** The topic: the first item of the revision. */
  itemId: string;
  /** Every item of the revision, in order. */
  itemIds: string[];
  /** The revision's language (null when `languageKey` is null). */
  languageId: string | null;
}

export interface ConfirmedTopicOptions {
  /** Key of the revision's language; default `java`, `null` for a syllabus without one. */
  languageKey?: string | null;
  subjectStatus?: SubjectStatus;
  items?: string[];
  groupTitle?: string | null;
}

/**
 * A topic a batch or an exercise can point at (010 research X9): an ACTIVE subject of `teacherId`
 * with a PROCESSED document and a CONFIRMED revision carrying a language, one group and its items.
 */
export async function createConfirmedTopic(
  t: TestApp,
  teacherId: string,
  options: ConfirmedTopicOptions = {},
): Promise<ConfirmedTopic> {
  const languageKey = options.languageKey === undefined ? "java" : options.languageKey;
  const language = languageKey === null ? null : await languageId(t, languageKey);
  const subject = await createSubject(t, teacherId, { status: options.subjectStatus ?? "ACTIVE" });
  const document = await createSyllabusDocument(t, subject.id, { status: "PROCESSED" });
  const confirmed = await createConfirmedRevision(
    t,
    document.id,
    [{ title: options.groupTitle ?? "Orientação a objetos", items: options.items ?? ["Herança e polimorfismo", "Interfaces"] }],
    { title: "Programação Orientada a Objetos", languageId: language },
  );
  return {
    subject,
    document,
    revision: confirmed.revision,
    groupId: confirmed.groups[0]!.id,
    itemId: confirmed.itemIds[0]!,
    itemIds: confirmed.itemIds,
    languageId: language,
  };
}

export interface GenerationBatchOptions {
  difficulty?: ExerciseDifficulty;
  /** Counts per type; default 2 open answer, 2 multiple choice, 1 code. */
  counts?: { OPEN_ANSWER?: number; MULTIPLE_CHOICE?: number; CODE?: number };
  trickQuestions?: number;
  /** Default: the topic's language when the batch has code, else null. */
  languageId?: string | null;
  distribution?: "AUTO" | "MANUAL";
  aiExecutionId?: string | null;
  generatedAt?: Date | null;
}

/** A generation batch row on `topic` (no execution unless `aiExecutionId` is given). */
export async function createGenerationBatch(
  t: TestApp,
  teacherId: string,
  topic: Pick<ConfirmedTopic, "itemId" | "revision" | "languageId">,
  options: GenerationBatchOptions = {},
): Promise<ExerciseGenerationBatch> {
  const counts = { OPEN_ANSWER: 2, MULTIPLE_CHOICE: 2, CODE: 1, ...options.counts };
  const total = counts.OPEN_ANSWER + counts.MULTIPLE_CHOICE + counts.CODE;
  return t.prisma.exerciseGenerationBatch.create({
    data: {
      teacherId,
      syllabusItemId: topic.itemId,
      syllabusRevisionId: topic.revision.id,
      difficulty: options.difficulty ?? "BASIC",
      requestedQuantity: total,
      openAnswerQuantity: counts.OPEN_ANSWER,
      multipleChoiceQuantity: counts.MULTIPLE_CHOICE,
      codeQuantity: counts.CODE,
      trickQuestionQuantity: options.trickQuestions ?? 0,
      languageId: options.languageId === undefined ? (counts.CODE > 0 ? topic.languageId : null) : options.languageId,
      distribution: options.distribution ?? "AUTO",
      aiExecutionId: options.aiExecutionId ?? null,
      idempotencyKey: randomUUID(),
      generatedAt: options.generatedAt ?? null,
    },
  });
}

export interface ExerciseOptions {
  type?: ExerciseType;
  status?: ExerciseStatus;
  origin?: ExerciseOrigin;
  difficulty?: ExerciseDifficulty;
  cognitiveObjective?: CognitiveObjective;
  statement?: string;
  explanation?: string;
  syllabusItemId?: string | null;
  /** OPEN_ANSWER. */
  expectedAnswer?: string;
  /** CODE (defaults: fixed texts; `starterCode` null). */
  instructions?: string;
  starterCode?: string | null;
  expectedSolution?: string;
  /** CODE: default the `java` entry. */
  languageId?: string;
  /** MULTIPLE_CHOICE: default three alternatives, the first correct. */
  alternatives?: { text: string; isCorrect: boolean }[];
  isTrickQuestion?: boolean;
  /** AI_GENERATED: the batch (required with that origin). */
  generationBatchId?: string;
  /** For APPROVED AI exercises; default the teacher. */
  reviewedById?: string;
}

let exerciseSequence = 0;

/**
 * Creates an exercise of `teacherId` and its alternatives in one transaction (the deferred
 * trigger checks them at commit). Defaults: a MANUAL, APPROVED multiple-choice exercise.
 */
export async function createExercise(
  t: TestApp,
  teacherId: string,
  options: ExerciseOptions = {},
): Promise<Exercise & { alternatives: ExerciseAlternative[] }> {
  exerciseSequence += 1;
  const type = options.type ?? "MULTIPLE_CHOICE";
  const origin = options.origin ?? "MANUAL";
  const status = options.status ?? "APPROVED";
  const statement = options.statement ?? `Enunciado de teste ${exerciseSequence}`;
  const language = type === "CODE" ? (options.languageId ?? (await languageId(t, "java"))) : null;
  const reviewed = origin === "AI_GENERATED" && status !== "DRAFT";
  const alternatives =
    type === "MULTIPLE_CHOICE"
      ? (options.alternatives ?? [
          { text: "Alternativa correta", isCorrect: true },
          { text: "Distrator um", isCorrect: false },
          { text: "Distrator dois", isCorrect: false },
        ])
      : [];

  return t.prisma.runInTransaction(async (tx) => {
    const exercise = await tx.exercise.create({
      data: {
        teacherId,
        type,
        difficulty: options.difficulty ?? "BASIC",
        cognitiveObjective: options.cognitiveObjective ?? "UNDERSTAND",
        origin,
        status,
        archivedFromStatus: status === "ARCHIVED" ? "APPROVED" : null,
        statement,
        statementSearchKey: searchKey(statement),
        explanation: options.explanation ?? "Explicação de teste",
        expectedAnswer: type === "OPEN_ANSWER" ? (options.expectedAnswer ?? "Resposta esperada") : null,
        instructions: type === "CODE" ? (options.instructions ?? "Implemente a função") : null,
        starterCode: type === "CODE" ? (options.starterCode ?? null) : null,
        expectedSolution: type === "CODE" ? (options.expectedSolution ?? "class Solucao {}") : null,
        languageId: language,
        isTrickQuestion: options.isTrickQuestion ?? false,
        syllabusItemId: options.syllabusItemId ?? null,
        generationBatchId: origin === "AI_GENERATED" ? options.generationBatchId : null,
        generationItemId: origin === "AI_GENERATED" ? randomUUID() : null,
        humanReviewed: reviewed,
        reviewedById: reviewed ? (options.reviewedById ?? teacherId) : null,
        reviewedAt: reviewed ? new Date() : null,
      },
    });
    const rows: ExerciseAlternative[] = [];
    for (const [position, alternative] of alternatives.entries()) {
      rows.push(await tx.exerciseAlternative.create({ data: { exerciseId: exercise.id, position, ...alternative } }));
    }
    return { ...exercise, alternatives: rows };
  });
}

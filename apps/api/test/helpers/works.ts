import { randomUUID } from "node:crypto";
import {
  centsToGrade,
  distributeGrade,
  gradeToCents,
  type UpdateWorkRequest,
  type WorkQuestionEdit,
  type WorkQuestionTeacherView,
  type WorkTeacherView,
} from "@repo/contracts";
import type {
  Subject,
  SubjectStatus,
  SyllabusDocument,
  SyllabusRevision,
  Work,
  WorkDifficulty,
  WorkGenerationRequest,
  WorkOrigin,
  WorkQuestion,
  WorkQuestionType,
  WorkStatus,
  WorkTestCaseVisibility,
} from "../../src/generated/prisma/client";
import { searchKey } from "../../src/platform/text/search-key";
import { createConfirmedRevision, createSubject, createSyllabusDocument } from "./factories";
import type { TestApp } from "./test-app";

// ── 011: work bank fixtures, written straight to the database ─────────────────────────────

/** Id of a seeded programming language by its key (`java`, `python`, `html-css`…). */
export async function workLanguageId(t: TestApp, key: string): Promise<string> {
  return (await t.prisma.programmingLanguage.findUniqueOrThrow({ where: { key }, select: { id: true } })).id;
}

export interface ConfirmedSyllabus {
  subject: Subject;
  document: SyllabusDocument;
  revision: SyllabusRevision;
  /** In order, with the ids of their items in order. */
  groups: { id: string; title: string | null; itemIds: string[] }[];
  /** Every item id, group after group. */
  itemIds: string[];
  /** The revision's language (null when `languageKey` is null). */
  languageId: string | null;
}

export interface ConfirmedSyllabusOptions {
  /** Key of the revision's language; default `java`, `null` for a syllabus without one. */
  languageKey?: string | null;
  subjectStatus?: SubjectStatus;
  /** Default: two groups, POO (herança, polimorfismo, classes abstratas) and coleções (listas, mapas). */
  groups?: { title?: string | null; items: string[] }[];
  /** The syllabus title; default "Programação Orientada a Objetos". */
  title?: string;
  competencyText?: string | null;
}

const DEFAULT_GROUPS = [
  { title: "Orientação a objetos", items: ["Herança", "Polimorfismo", "Classes abstratas"] },
  { title: "Coleções", items: ["Listas", "Mapas"] },
];

/**
 * The topics a work can point at (011 research W11): an ACTIVE subject of `teacherId` with a
 * PROCESSED document and a CONFIRMED revision carrying a language, groups and several items.
 */
export async function createConfirmedSyllabus(
  t: TestApp,
  teacherId: string,
  options: ConfirmedSyllabusOptions = {},
): Promise<ConfirmedSyllabus> {
  const languageKey = options.languageKey === undefined ? "java" : options.languageKey;
  const language = languageKey === null ? null : await workLanguageId(t, languageKey);
  const subject = await createSubject(t, teacherId, { status: options.subjectStatus ?? "ACTIVE" });
  const document = await createSyllabusDocument(t, subject.id, { status: "PROCESSED" });
  const groups = options.groups ?? DEFAULT_GROUPS;
  const confirmed = await createConfirmedRevision(t, document.id, groups, {
    title: options.title ?? "Programação Orientada a Objetos",
    competencyText: options.competencyText ?? null,
    languageId: language,
  });
  return {
    subject,
    document,
    revision: confirmed.revision,
    groups: confirmed.groups.map((group, index) => ({ ...group, title: groups[index]!.title ?? null })),
    itemIds: confirmed.itemIds,
    languageId: language,
  };
}

export interface WorkQuestionFixture {
  type?: WorkQuestionType;
  statement?: string;
  explanation?: string | null;
  /** Items of the work's topics (0–3). */
  topicItemIds?: string[];
  /** OPEN_ANSWER. */
  expectedAnswer?: string;
  rubric?: string | null;
  /** MULTIPLE_CHOICE: default three alternatives, the first correct. */
  alternatives?: { text: string; isCorrect: boolean }[];
  isTrickQuestion?: boolean;
  /** CODE (defaults: fixed texts, the `java` entry, one PUBLIC and one PRIVATE test case). */
  instructions?: string | null;
  starterCode?: string | null;
  expectedSolution?: string;
  languageId?: string;
  testCases?: { input: string; expectedOutput: string; visibility: WorkTestCaseVisibility }[];
}

export interface WorkOptions {
  /** The work's subject; default the syllabus' subject, or a new subject when there is none. */
  subjectId?: string;
  /** The topics come from this syllabus' revision. */
  syllabus?: Pick<ConfirmedSyllabus, "subject" | "revision" | "itemIds">;
  /** Default: the syllabus' first item, or none without a syllabus. */
  topicItemIds?: string[];
  title?: string;
  description?: string | null;
  difficulty?: WorkDifficulty | null;
  /** Default "1.00". */
  totalGrade?: string;
  status?: WorkStatus;
  origin?: WorkOrigin;
  /** Default: one multiple-choice question. */
  questions?: WorkQuestionFixture[];
  /** AI_GENERATED: the request (required with that origin). */
  generationRequestId?: string;
  /** For APPROVED AI works; default the teacher. */
  reviewedById?: string;
  humanEdited?: boolean;
  /** ARCHIVED: the status a restore goes back to; default APPROVED. */
  archivedFromStatus?: "DRAFT" | "APPROVED";
  /** Default: now (the bank lists by `updated_at desc, id`). */
  updatedAt?: Date;
}

export type WorkFixture = Work & { questions: WorkQuestion[] };

let workSequence = 0;

const STRATEGY = { OPEN_ANSWER: "AI_REVIEW", MULTIPLE_CHOICE: "EXACT_MATCH", CODE: "TEST_CASES" } as const;

/**
 * Creates a work of `teacherId` with its topics, questions, alternatives, test cases and question
 * topics in one transaction (the deferred triggers check them at commit). Values by position
 * (research W4). Defaults: a MANUAL, APPROVED work with one multiple-choice question worth 1.00.
 */
export async function createWork(t: TestApp, teacherId: string, options: WorkOptions = {}): Promise<WorkFixture> {
  workSequence += 1;
  const origin = options.origin ?? "MANUAL";
  const status = options.status ?? "APPROVED";
  const title = options.title ?? `Trabalho de teste ${workSequence}`;
  const subjectId = options.subjectId ?? options.syllabus?.subject.id ?? (await createSubject(t, teacherId)).id;
  const topicItemIds = options.topicItemIds ?? (options.syllabus ? [options.syllabus.itemIds[0]!] : []);
  const revisionId = topicItemIds.length > 0 ? options.syllabus!.revision.id : null;
  const questions = options.questions ?? [{}];
  const totalGrade = options.totalGrade ?? "1.00";
  const values = distributeGrade(gradeToCents(totalGrade), questions.length).map(centsToGrade);
  const reviewed = origin === "AI_GENERATED" && status !== "DRAFT";
  const java = questions.some((question) => question.type === "CODE" && !question.languageId) ? await workLanguageId(t, "java") : null;

  return t.prisma.runInTransaction(async (tx) => {
    const work = await tx.work.create({
      data: {
        teacherId,
        subjectId,
        syllabusRevisionId: revisionId,
        title,
        titleSearchKey: searchKey(title),
        description: options.description ?? null,
        difficulty: options.difficulty === undefined ? (origin === "AI_GENERATED" ? "INTERMEDIATE" : null) : options.difficulty,
        totalGrade,
        questionCount: questions.length,
        origin,
        status,
        archivedFromStatus: status === "ARCHIVED" ? (options.archivedFromStatus ?? "APPROVED") : null,
        generationRequestId: origin === "AI_GENERATED" ? options.generationRequestId : null,
        humanReviewed: reviewed,
        humanEdited: options.humanEdited ?? false,
        reviewedById: reviewed ? (options.reviewedById ?? teacherId) : null,
        reviewedAt: reviewed ? new Date() : null,
        ...(options.updatedAt ? { updatedAt: options.updatedAt } : {}),
      },
    });
    for (const [position, syllabusItemId] of topicItemIds.entries()) {
      await tx.workTopic.create({ data: { workId: work.id, syllabusItemId, syllabusRevisionId: revisionId!, position } });
    }
    const created: WorkQuestion[] = [];
    for (const [position, fixture] of questions.entries()) {
      const type = fixture.type ?? "MULTIPLE_CHOICE";
      const statement = fixture.statement ?? `Enunciado ${position + 1} do ${title}`;
      const question = await tx.workQuestion.create({
        data: {
          workId: work.id,
          position,
          type,
          gradingStrategy: STRATEGY[type],
          statement,
          statementSearchKey: searchKey(statement),
          value: values[position]!,
          explanation: fixture.explanation === undefined ? "Explicação de teste" : fixture.explanation,
          expectedAnswer: type === "OPEN_ANSWER" ? (fixture.expectedAnswer ?? "Resposta esperada") : null,
          rubric: type === "OPEN_ANSWER" ? (fixture.rubric ?? null) : null,
          instructions: type === "CODE" ? (fixture.instructions === undefined ? "Implemente a função" : fixture.instructions) : null,
          starterCode: type === "CODE" ? (fixture.starterCode ?? null) : null,
          expectedSolution: type === "CODE" ? (fixture.expectedSolution ?? "class Solucao {}") : null,
          languageId: type === "CODE" ? (fixture.languageId ?? java) : null,
          isTrickQuestion: fixture.isTrickQuestion ?? false,
          generationItemId: origin === "AI_GENERATED" ? randomUUID() : null,
        },
      });
      created.push(question);
      if (type === "MULTIPLE_CHOICE") {
        const alternatives = fixture.alternatives ?? [
          { text: "Alternativa correta", isCorrect: true },
          { text: "Distrator um", isCorrect: false },
          { text: "Distrator dois", isCorrect: false },
        ];
        await tx.workQuestionAlternative.createMany({
          data: alternatives.map((alternative, index) => ({ questionId: question.id, position: index, ...alternative })),
        });
      }
      if (type === "CODE") {
        const testCases = fixture.testCases ?? [
          { input: "1 2", expectedOutput: "3", visibility: "PUBLIC" as const },
          { input: "2 2", expectedOutput: "4", visibility: "PRIVATE" as const },
        ];
        await tx.workQuestionTestCase.createMany({
          data: testCases.map((testCase, index) => ({ questionId: question.id, position: index, ...testCase })),
        });
      }
      for (const syllabusItemId of fixture.topicItemIds ?? []) {
        await tx.workQuestionTopic.create({ data: { questionId: question.id, workId: work.id, syllabusItemId } });
      }
    }
    return { ...work, questions: created };
  });
}

export interface WorkGenerationRequestOptions {
  difficulty?: WorkDifficulty;
  /** Default: the syllabus' first item. */
  topicItemIds?: string[];
  title?: string;
  /** Default "10.00". */
  totalGrade?: string;
  /** Counts per type; default 2 open answer, 2 multiple choice, 1 code. */
  counts?: { OPEN_ANSWER?: number; MULTIPLE_CHOICE?: number; CODE?: number };
  trickQuestions?: number;
  /** Default: the syllabus' language when the request has code, else null. */
  languageId?: string | null;
  distribution?: "AUTO" | "MANUAL";
  aiExecutionId?: string | null;
  generatedAt?: Date | null;
}

/** A generation request row on `syllabus` with its topics (no execution unless `aiExecutionId` is given). */
export async function createWorkGenerationRequest(
  t: TestApp,
  teacherId: string,
  syllabus: Pick<ConfirmedSyllabus, "subject" | "revision" | "itemIds" | "languageId">,
  options: WorkGenerationRequestOptions = {},
): Promise<WorkGenerationRequest> {
  const counts = { OPEN_ANSWER: 2, MULTIPLE_CHOICE: 2, CODE: 1, ...options.counts };
  const total = counts.OPEN_ANSWER + counts.MULTIPLE_CHOICE + counts.CODE;
  const topicItemIds = options.topicItemIds ?? [syllabus.itemIds[0]!];
  return t.prisma.runInTransaction(async (tx) => {
    const request = await tx.workGenerationRequest.create({
      data: {
        teacherId,
        subjectId: syllabus.subject.id,
        syllabusRevisionId: syllabus.revision.id,
        title: options.title ?? "Trabalho gerado",
        difficulty: options.difficulty ?? "INTERMEDIATE",
        totalGrade: options.totalGrade ?? "10.00",
        requestedQuantity: total,
        openAnswerQuantity: counts.OPEN_ANSWER,
        multipleChoiceQuantity: counts.MULTIPLE_CHOICE,
        codeQuantity: counts.CODE,
        trickQuestionQuantity: options.trickQuestions ?? 0,
        languageId: options.languageId === undefined ? (counts.CODE > 0 ? syllabus.languageId : null) : options.languageId,
        distribution: options.distribution ?? "AUTO",
        aiExecutionId: options.aiExecutionId ?? null,
        idempotencyKey: randomUUID(),
        generatedAt: options.generatedAt ?? null,
      },
    });
    await tx.workGenerationRequestTopic.createMany({
      data: topicItemIds.map((syllabusItemId, position) => ({
        requestId: request.id,
        syllabusItemId,
        syllabusRevisionId: syllabus.revision.id,
        position,
      })),
    });
    return request;
  });
}

/** A question of the teacher view as the edit sends it back: same id, type and content. */
export function toQuestionEdit(question: WorkQuestionTeacherView): WorkQuestionEdit {
  const common = { id: question.id, statement: question.statement, explanation: question.explanation, topicItemIds: question.topicItemIds };
  if (question.type === "OPEN_ANSWER") {
    return { type: "OPEN_ANSWER", ...common, expectedAnswer: question.expectedAnswer!, rubric: question.rubric ?? null };
  }
  if (question.type === "MULTIPLE_CHOICE") {
    return {
      type: "MULTIPLE_CHOICE",
      ...common,
      alternatives: question.alternatives!.map(({ text, isCorrect }) => ({ text, isCorrect })),
      isTrickQuestion: question.isTrickQuestion,
    };
  }
  return {
    type: "CODE",
    ...common,
    instructions: question.instructions ?? null,
    starterCode: question.starterCode ?? null,
    expectedSolution: question.expectedSolution!,
    languageId: question.language!.id,
    testCases: question.testCases!.map(({ input, expectedOutput, visibility }) => ({ input, expectedOutput, visibility })),
  };
}

/** `PUT /works/:id` body that saves `view` unchanged (research W16); spread overrides on top. */
export function toUpdateBody(view: WorkTeacherView): UpdateWorkRequest {
  return {
    title: view.title,
    description: view.description,
    difficulty: view.difficulty,
    totalGrade: view.totalGrade,
    topics:
      view.syllabusRevisionId === null
        ? null
        : { syllabusRevisionId: view.syllabusRevisionId, syllabusItemIds: view.topics.map((topic) => topic.syllabusItemId) },
    questions: view.questions.map(toQuestionEdit),
    version: view.version,
  };
}

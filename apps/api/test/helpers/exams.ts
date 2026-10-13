import { randomUUID } from "node:crypto";
import {
  centsToGrade,
  type CreateExamRequest,
  distributeGrade,
  type ExamQuestionEdit,
  gradeToCents,
  type TeacherExam,
  type UpdateExamRequest,
} from "@repo/contracts";
import type {
  Exam,
  ExamOrigin,
  ExamQuestion,
  ExamStatus,
  WorkDifficulty,
  WorkQuestionType,
  WorkTestCaseVisibility,
} from "../../src/generated/prisma/client";
import { searchKey } from "../../src/platform/text/search-key";
import { markAllPresent } from "./attendance";
import type { api, TestApp } from "./test-app";
import { type ConfirmedSyllabus, createConfirmedSyllabus, workLanguageId } from "./works";

// ── 018: Banco de Provas fixtures, written straight to the database ───────────────────────

export interface ExamQuestionFixture {
  type?: WorkQuestionType;
  statement?: string;
  explanation?: string | null;
  /** Default BASIC; null only in a DRAFT (the approval trigger requires one). */
  difficulty?: WorkDifficulty | null;
  /** Items of the exam's topics (1–3 on approval); default the exam's first topic. */
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

export interface ExamOptions {
  /** The topics come from this syllabus' revision; default a new confirmed syllabus of the teacher. */
  syllabus?: Pick<ConfirmedSyllabus, "subject" | "revision" | "itemIds">;
  /** Default: the syllabus' first item. */
  topicItemIds?: string[];
  title?: string;
  description?: string | null;
  /** Default "1.00". */
  totalGrade?: string;
  /** Default APPROVED. */
  status?: ExamStatus;
  origin?: ExamOrigin;
  /** Default: one multiple-choice question. */
  questions?: ExamQuestionFixture[];
  /** AI_GENERATED: the request (required with that origin). */
  generationRequestId?: string;
  /** ARCHIVED: the status a restore goes back to; default APPROVED. */
  archivedFromStatus?: "DRAFT" | "APPROVED";
}

export type ExamFixture = Exam & { questions: ExamQuestion[] };

let examSequence = 0;

const STRATEGY = { OPEN_ANSWER: "AI_REVIEW", MULTIPLE_CHOICE: "EXACT_MATCH", CODE: "TEST_CASES" } as const;

/**
 * Creates an exam of `teacherId` with its topics, questions, alternatives, test cases and question
 * topics in one transaction (the deferred triggers check them at commit). Values by position (011
 * rule). Defaults: a MANUAL, APPROVED exam with one BASIC multiple-choice question worth 1.00 on the
 * syllabus' first item.
 */
export async function createExam(t: TestApp, teacherId: string, options: ExamOptions = {}): Promise<ExamFixture> {
  examSequence += 1;
  const syllabus = options.syllabus ?? (await createConfirmedSyllabus(t, teacherId));
  const origin = options.origin ?? "MANUAL";
  const status = options.status ?? "APPROVED";
  const title = options.title ?? `Prova de teste ${examSequence}`;
  const topicItemIds = options.topicItemIds ?? [syllabus.itemIds[0]!];
  const questions = options.questions ?? [{}];
  const totalGrade = options.totalGrade ?? "1.00";
  const values = distributeGrade(gradeToCents(totalGrade), questions.length).map(centsToGrade);
  const reviewed = origin === "AI_GENERATED" && status !== "DRAFT";
  const java = questions.some((question) => question.type === "CODE" && !question.languageId) ? await workLanguageId(t, "java") : null;

  return t.prisma.runInTransaction(async (tx) => {
    const exam = await tx.exam.create({
      data: {
        teacherId,
        subjectId: syllabus.subject.id,
        syllabusRevisionId: syllabus.revision.id,
        title,
        titleSearchKey: searchKey(title),
        description: options.description ?? null,
        totalGrade,
        questionCount: questions.length,
        origin,
        status,
        archivedFromStatus: status === "ARCHIVED" ? (options.archivedFromStatus ?? "APPROVED") : null,
        generationRequestId: origin === "AI_GENERATED" ? options.generationRequestId : null,
        humanReviewed: reviewed,
        reviewedById: reviewed ? teacherId : null,
        reviewedAt: reviewed ? new Date() : null,
      },
    });
    for (const [position, syllabusItemId] of topicItemIds.entries()) {
      await tx.examTopic.create({ data: { examId: exam.id, syllabusItemId, syllabusRevisionId: syllabus.revision.id, position } });
    }
    const created: ExamQuestion[] = [];
    for (const [position, fixture] of questions.entries()) {
      const type = fixture.type ?? "MULTIPLE_CHOICE";
      const statement = fixture.statement ?? `Enunciado ${position + 1} da ${title}`;
      const question = await tx.examQuestion.create({
        data: {
          examId: exam.id,
          position,
          type,
          gradingStrategy: STRATEGY[type],
          statement,
          statementSearchKey: searchKey(statement),
          value: values[position]!,
          difficulty: fixture.difficulty === undefined ? "BASIC" : fixture.difficulty,
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
        await tx.examQuestionAlternative.createMany({
          data: alternatives.map((alternative, index) => ({ questionId: question.id, position: index, ...alternative })),
        });
      }
      if (type === "CODE") {
        const testCases = fixture.testCases ?? [
          { input: "1 2", expectedOutput: "3", visibility: "PUBLIC" as const },
          { input: "2 2", expectedOutput: "4", visibility: "PRIVATE" as const },
        ];
        await tx.examQuestionTestCase.createMany({
          data: testCases.map((testCase, index) => ({ questionId: question.id, position: index, ...testCase })),
        });
      }
      for (const syllabusItemId of fixture.topicItemIds ?? [topicItemIds[0]!]) {
        await tx.examQuestionTopic.create({ data: { questionId: question.id, examId: exam.id, syllabusItemId } });
      }
    }
    return { ...exam, questions: created };
  });
}

// ── 018/US1: the Banco de Provas through its routes ───────────────────────────────────────

type Client = ReturnType<typeof api>;

/** Three questions, one of each type, all on the first topic: values 3,34 · 3,33 · 3,33 of 10,00. */
export function examQuestions(topicId: string, javaId: string): ExamQuestionEdit[] {
  return [
    {
      type: "OPEN_ANSWER",
      statement: "Explique herança.",
      expectedAnswer: "Reuso por extensão de uma classe.",
      difficulty: "BASIC",
      topicIds: [topicId],
    },
    {
      type: "MULTIPLE_CHOICE",
      statement: "Qual palavra declara herança em Java?",
      alternatives: [
        { text: "extends", isCorrect: true },
        { text: "implements", isCorrect: false },
        { text: "inherits", isCorrect: false },
      ],
      isTrickQuestion: false,
      difficulty: "INTERMEDIATE",
      topicIds: [topicId],
    },
    {
      type: "CODE",
      statement: "Some dois números.",
      expectedSolution: "class Soma {}",
      languageId: javaId,
      testCases: [{ input: "1 2", expectedOutput: "3", visibility: "PRIVATE" }],
      difficulty: "ADVANCED",
      topicIds: [topicId],
    },
  ];
}

/** A `POST /exams` body over a confirmed syllabus: the three questions of `examQuestions` and 10,00. */
export async function examBody(
  t: TestApp,
  syllabus: Pick<ConfirmedSyllabus, "subject" | "revision" | "itemIds">,
  overrides: Partial<CreateExamRequest> = {},
): Promise<CreateExamRequest> {
  return {
    subjectId: syllabus.subject.id,
    syllabusRevisionId: syllabus.revision.id,
    title: "Prova de POO",
    totalGrade: "10.00",
    saveAs: "DRAFT",
    topicIds: [syllabus.itemIds[0]!],
    questions: examQuestions(syllabus.itemIds[0]!, await workLanguageId(t, "java")),
    ...overrides,
  };
}

/** Creates an exam through `POST /exams`; returns the response. */
export const postExam = (client: Client, body: CreateExamRequest) => client.post("/api/exams", body);

/** An APPROVED exam of the client's teacher, created and approved through the routes. */
export async function approvedExam(t: TestApp, client: Client, syllabus: Pick<ConfirmedSyllabus, "subject" | "revision" | "itemIds">): Promise<TeacherExam> {
  const created = await postExam(client, await examBody(t, syllabus));
  const approved = await client.post(`/api/exams/${created.body.id}/approve`, { version: created.body.version });
  return approved.body as TeacherExam;
}

/** A teacher view back into a `PUT /exams/:id` body (kept questions by `id`). */
export function toExamUpdateBody(view: TeacherExam): UpdateExamRequest {
  return {
    syllabusRevisionId: view.syllabusRevisionId,
    title: view.title,
    description: view.description,
    totalGrade: view.totalGrade,
    topicIds: view.topics.map((topic) => topic.syllabusItemId),
    version: view.version,
    questions: view.questions.map((question): ExamQuestionEdit => {
      const common = {
        id: question.id,
        statement: question.statement,
        explanation: question.explanation,
        difficulty: question.difficulty,
        topicIds: question.topicIds,
      };
      if (question.type === "OPEN_ANSWER") return { ...common, type: "OPEN_ANSWER", expectedAnswer: question.expectedAnswer!, rubric: question.rubric ?? null };
      if (question.type === "MULTIPLE_CHOICE") {
        return {
          ...common,
          type: "MULTIPLE_CHOICE",
          alternatives: question.alternatives!.map(({ text, isCorrect }) => ({ text, isCorrect })),
          isTrickQuestion: question.isTrickQuestion,
        };
      }
      return {
        ...common,
        type: "CODE",
        instructions: question.instructions ?? null,
        starterCode: question.starterCode ?? null,
        expectedSolution: question.expectedSolution!,
        languageId: question.language!.id,
        testCases: question.testCases!.map(({ input, expectedOutput, visibility }) => ({ input, expectedOutput, visibility })),
      };
    }),
  };
}

// ── 018/US2: applying an exam to a class through the 012 route ─────────────────────────────

/**
 * Body overrides of an exam's `POST /classes/:classId/activities`. A key set to `undefined` is left out
 * of the body (the defaults of the contract then apply); a forbidden field (`executionMode`,
 * `deadline`…) goes in as given, for the tests that expect the 400.
 */
export interface ApplyExamOverrides {
  idempotencyKey?: string;
  title?: string;
  instructions?: string | null;
  /** Default null: published now, by the server clock. */
  publishAt?: string | null;
  /** Default 60. */
  durationMinutes?: number;
  inactivityLimitSeconds?: number;
  startWindowMinutes?: number;
  acknowledgeOutOfScope?: boolean;
  [forbidden: string]: unknown;
  /**
   * Not part of the body. `"ALL"` (default) marks every ACTIVE student of the class present through the
   * attendance route once the exam is applied, as `applyWork` does since 016; `"NONE"` leaves it
   * invisible to every student.
   */
  attendance?: "ALL" | "NONE";
}

/** `POST /classes/:classId/activities` with an exam of the teacher's Banco de Provas (018/US2). */
export async function applyExam(client: Client, classId: string, examId: string, overrides: ApplyExamOverrides = {}) {
  const { attendance = "ALL", ...fields } = overrides;
  const body = Object.fromEntries(
    Object.entries({
      idempotencyKey: randomUUID(),
      source: { type: "EXAM", examId },
      title: "Prova aplicada",
      instructions: "Leia as regras.",
      publishAt: null,
      durationMinutes: 60,
      acknowledgeOutOfScope: false,
      ...fields,
    }).filter(([, value]) => value !== undefined),
  );
  const res = await client.post(`/api/classes/${classId}/activities`, body);
  if (attendance === "ALL" && (res.status === 200 || res.status === 201)) await markAllPresent(client, classId, res.body.id);
  return res;
}

// ── 018/US3: the student's exam ─────────────────────────────────────────────────────────────

/** `POST /me/activities/:activityId/attempt` with the rules accepted (018 research T13). */
export function startExam(client: Client, activityId: string) {
  return client.post(`/api/me/activities/${activityId}/attempt`, { acceptRules: true });
}

/**
 * Opens a hold on an IN_PROGRESS exam attempt straight in the database, as the 4th occurrence would
 * (US4): integrity events, occurrences 1–4 and the hold on the 4th. For the suites that need a held
 * attempt before the occurrence counting exists.
 */
export async function holdByHand(t: TestApp, attempt: { id: string; activityId: string; studentUserId: string }, openedAt = new Date()) {
  const ids = { attemptId: attempt.id, activityId: attempt.activityId, studentUserId: attempt.studentUserId };
  for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
    const event = await t.prisma.attemptIntegrityEvent.create({
      data: { ...ids, clientEventId: randomUUID(), type: "SCREEN_LEFT", recordedAt: openedAt },
    });
    await t.prisma.examOccurrence.create({ data: { ...ids, ordinal, kind: "SCREEN_LEFT", firstEventId: event.id, recordedAt: openedAt } });
  }
  return t.prisma.examAttemptHold.create({ data: { ...ids, occurrenceOrdinal: 4, openedAt } });
}

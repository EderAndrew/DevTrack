import { randomUUID } from "node:crypto";
import { centsToGrade, distributeGrade, gradeToCents } from "@repo/contracts";
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
import type { TestApp } from "./test-app";
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

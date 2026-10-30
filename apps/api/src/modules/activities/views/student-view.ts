import {
  type Answer,
  centsToGrade,
  type ActivityType,
  type AiHelpAllowance,
  EXAM_WARNINGS,
  type ExamEndReason,
  type ExamOccurrenceKind,
  type ExecutionMode,
  type ExerciseResult,
  type GradeCents,
  type LatePolicy,
  type PauseInitiator,
  type PauseReason,
  type StudentActivity,
  type StudentActivitySummary,
  type StudentAnswer,
  type StudentExam,
  type StudentExamEndReason,
  type StudentExerciseAttempt,
  type StudentQuestion,
} from "@repo/contracts";
import type { ExecutionOf } from "../code-run-availability";
import type { ActivityFacts } from "../status/facts";
import { canAnswer } from "../status/operations";
import { deriveStudentStatus, isResultVisible, isUrgent } from "../status/student-status";
import type { ActivityQuestionRow } from "./rows";

// The only builders of what a student receives (research P15, 012/FR-030, FR-032): each one copies
// an allowlist from the snapshot — never removes fields from the teacher's view. A new field reaches
// students only when it is listed here. No answer key, explanation, trick flag, grading strategy,
// private test case or pending reason, and no grade or feedback before the release. An EXERCISE
// (013) shows points instead of a grade, deadline or late policy.

/**
 * One question as the student may see it: 011/FR-033 applied to the snapshot. `executionOf` (019
 * research B17) is given only when the activity runs code (`runsCode`); it decides the execution of a CODE question from the
 * language's profile key and the PUBLIC case count, never from a private case.
 */
export function toStudentQuestion(row: ActivityQuestionRow, executionOf: ExecutionOf | null = null): StudentQuestion {
  const publicTestCases = [...row.testCases]
    .filter((testCase) => testCase.visibility === "PUBLIC")
    .sort((a, b) => a.position - b.position)
    .map((testCase) => ({ input: testCase.input, expectedOutput: testCase.expectedOutput }));
  return {
    id: row.id,
    position: row.position,
    type: row.type,
    value: row.valueCents === null ? null : centsToGrade(row.valueCents),
    points: row.points,
    statement: row.statement,
    instructions: row.instructions,
    starterCode: row.starterCode,
    language: row.language ? { name: row.language.name, highlight: row.language.highlight } : null,
    publicTestCases,
    alternatives: [...row.alternatives].sort((a, b) => a.position - b.position).map((alternative) => ({ id: alternative.id, text: alternative.text })),
    execution:
      executionOf && row.type === "CODE" ? executionOf({ execution: row.language?.execution ?? null, publicCaseCount: publicTestCases.length }) : null,
  };
}

/** What the views need of an activity seen by one student. */
export interface StudentActivityInput {
  id: string;
  type: ActivityType;
  /** 015: NORMAL or CONTROLLED, and the AI help per student (always NORMAL and 0 for EXERCISE). */
  executionMode: ExecutionMode;
  aiHelpAllowance: AiHelpAllowance;
  /** 021: the work lets the student run code on its CODE questions (research Y9); false unless ASSIGNMENT. */
  codeExecutionAllowed: boolean;
  /** 023: "Em grupo" with its maximum, or null (research U2). */
  groupSize: number | null;
  title: string;
  instructions: string | null;
  class: { id: string; name: string };
  subjectName: string | null;
  teacherName: string;
  publishAt: Date;
  /** ASSIGNMENT only (013 K1). */
  deadline: Date | null;
  latePolicy: LatePolicy | null;
  totalCents: GradeCents | null;
  /** EXERCISE only: possible points, those of attempt 1 and whether a mark is pending (013/FR-015). */
  points: { possible: number; earned: number; awaitingCorrection: boolean } | null;
  facts: ActivityFacts;
  /** The session holds `notas.proprias.visualizar`. */
  canSeeResults: boolean;
  submission: {
    submittedAt: Date;
    late: boolean;
    acceptedByTeacher: boolean;
    blankCount: number;
    gradeCents: GradeCents;
    generalFeedback: string | null;
    gradings: { questionId: string; finalCents: GradeCents | null; feedback: string | null }[];
  } | null;
}

/** 016: the session student's pause that is still open (research M6). */
export interface OpenPauseInput {
  id: string;
  initiatedBy: PauseInitiator;
  reason: PauseReason;
  note: string | null;
  startedAt: Date;
}

/** 016: one of the session student's own pauses after the submission, its end derived (FR-021). */
export interface OwnPauseInput extends OpenPauseInput {
  endedAt: Date | null;
}

/** 023: the session student's group in this activity, as the loader resolved it (research U9). */
export interface StudentGroupInput {
  groupSize: number;
  leader: { id: string; name: string };
  /** Leader included, by join time. */
  members: { id: string; name: string }[];
  editor: { id: string; name: string };
  myRole: "LEADER" | "MEMBER";
  canEdit: boolean;
  addedBy: { id: string; name: string } | null;
  freeSlots: number;
  version: number;
}

export interface StudentActivityDetailInput extends StudentActivityInput {
  /** The AI helps delivered to the session student in this activity (015/FR-020). */
  aiHelpUsed: number;
  /** The loader leaves the questions and the answers out while `pause` is open (016/FR-013). */
  questions: ActivityQuestionRow[];
  /** 016: the open pause of the student's attempt, or null. */
  pause: OpenPauseInput | null;
  /** 016: the own pauses, oldest first; the loader reads them only after the submission. */
  pauses: OwnPauseInput[];
  attempt: { number: number; startedAt: Date; lastSavedAt: Date | null; answers: StudentAnswer[] } | null;
  /** EXERCISE: the concluded attempts, newest first (013/FR-005). */
  completedAttempts: { number: number; completedAt: Date }[];
  /** EXERCISE: the latest concluded attempt of the session student, with its results (013/FR-012). */
  lastResult: ConcludedAttemptInput | null;
  /** EXAM only (018). */
  exam: StudentExamInput | null;
  /** 023: the session student's group (FR-009), or null for an individual attempt or before the start. */
  group: StudentGroupInput | null;
}

/** 018: an EXAM's facts for its student, as loaded (research T13); null for the other types. */
export interface StudentExamInput {
  durationMinutes: number;
  inactivityLimitSeconds: number;
  startDeadline: Date;
  /** From the start: the start plus the duration, capped by the close or the cancellation. */
  endsAt: Date | null;
  /** The last occurrence's ordinal, 0 when none. */
  occurrenceCount: number;
  /** The open hold of an attempt in progress; the loader then leaves the questions and the answers out. */
  hold: { openedAt: Date } | null;
  endReason: ExamEndReason | null;
  /** The attempt's occurrences once it ended (018/FR-031); empty before. */
  ownOccurrences: { ordinal: number; kind: ExamOccurrenceKind; recordedAt: Date }[];
}

/** A concluded EXERCISE attempt of the session student, as loaded (013 K6, K10). */
export interface ConcludedAttemptInput {
  number: number;
  completedAt: Date;
  results: { questionId: string; result: ExerciseResult; points: number; scoring: boolean; comment: string | null }[];
  answers: { questionId: string; answer: Answer }[];
}

const SUMMARY_LENGTH = 160;

/** The first 160 characters of the instructions, whitespace collapsed (plain text; the web escapes it). */
export function summaryOf(instructions: string | null): string {
  const text = (instructions ?? "").replace(/\s+/g, " ").trim();
  return text.length <= SUMMARY_LENGTH ? text : `${text.slice(0, SUMMARY_LENGTH - 1).trimEnd()}…`;
}

const resultVisible = (input: StudentActivityInput) => input.canSeeResults && isResultVisible(input.facts);

export function toStudentSummary(input: StudentActivityInput): StudentActivitySummary {
  const visible = resultVisible(input);
  return {
    id: input.id,
    type: input.type,
    executionMode: input.executionMode,
    aiHelp: { allowance: input.aiHelpAllowance },
    title: input.title,
    summary: summaryOf(input.instructions),
    class: { id: input.class.id, name: input.class.name },
    subjectName: input.subjectName,
    teacherName: input.teacherName,
    publishedAt: input.publishAt.toISOString(),
    deadline: input.deadline?.toISOString() ?? null,
    latePolicy: input.latePolicy,
    status: deriveStudentStatus(input.facts),
    late: input.submission?.late ?? false,
    canAnswer: canAnswer(input.facts),
    urgent: isUrgent(input.facts),
    submittedAt: input.submission?.submittedAt.toISOString() ?? null,
    totalGrade: input.totalCents === null ? null : centsToGrade(input.totalCents),
    result:
      visible && input.submission
        ? {
            grade: centsToGrade(input.submission.gradeCents),
            hasFeedback: input.submission.generalFeedback !== null || input.submission.gradings.some((grading) => grading.feedback !== null),
          }
        : null,
    points: input.points && { ...input.points },
    // 023/US3-3: "Em grupo" in the list; an individual work's summary has no such key (SC-007).
    ...(input.groupSize !== null ? { groupSize: input.groupSize } : {}),
  };
}

/**
 * Whether the CODE questions of the activity carry an execution (research Y9): an EXERCISE (019) or a
 * work applied with "Permitir executar o código" (021); a work without it and an exam never do.
 */
export function runsCode<T extends Pick<StudentActivityInput, "type" | "codeExecutionAllowed">>(input: T): input is T & { type: "EXERCISE" | "ASSIGNMENT" } {
  return input.type === "EXERCISE" || (input.type === "ASSIGNMENT" && input.codeExecutionAllowed);
}

/**
 * `executionOf` (019): the Code Runner's availability at this read, applied to the CODE questions of
 * an activity that runs code (`runsCode`); any other activity's questions never carry an execution.
 */
export function toStudentActivity(input: StudentActivityDetailInput, executionOf: ExecutionOf | null = null): StudentActivity {
  const { result: _summaryResult, ...summary } = toStudentSummary(input);
  const visible = resultVisible(input);
  // 016/FR-013, FR-022: a paused attempt shows only the notice, whatever the loader read; 018/FR-019:
  // so does an exam attempt on hold.
  const paused = input.pause !== null || input.exam?.hold != null;
  return {
    ...summary,
    aiHelp: { allowance: input.aiHelpAllowance, used: input.aiHelpUsed },
    groupSize: input.groupSize,
    group: input.group && toStudentGroup(input.group),
    instructions: input.instructions,
    serverNow: input.facts.now.toISOString(),
    questions: paused
      ? []
      : [...input.questions]
          .sort((a, b) => a.position - b.position)
          .map((row) => toStudentQuestion(row, runsCode(input) ? executionOf : null)),
    attempt: input.attempt
      ? {
          number: input.attempt.number,
          startedAt: input.attempt.startedAt.toISOString(),
          lastSavedAt: input.attempt.lastSavedAt?.toISOString() ?? null,
          answers: paused
            ? []
            : input.attempt.answers.map((answer) => ({
                questionId: answer.questionId,
                answer: answer.answer,
                revision: answer.revision,
                // 023 (contracts/http-api.md): who saved it, only id and name, only on a group's attempt.
                ...(answer.savedBy ? { savedBy: { id: answer.savedBy.id, name: answer.savedBy.name } } : {}),
              })),
        }
      : null,
    submission: input.submission
      ? {
          submittedAt: input.submission.submittedAt.toISOString(),
          late: input.submission.late,
          acceptedByTeacher: input.submission.acceptedByTeacher,
          blankCount: input.submission.blankCount,
        }
      : null,
    result:
      visible && input.submission
        ? {
            grade: centsToGrade(input.submission.gradeCents),
            generalFeedback: input.submission.generalFeedback,
            questions: input.submission.gradings.map((grading) => ({
              questionId: grading.questionId,
              grade: centsToGrade(grading.finalCents ?? 0),
              feedback: grading.feedback,
            })),
          }
        : null,
    completedAttempts: input.completedAttempts.map((attempt) => ({ number: attempt.number, completedAt: attempt.completedAt.toISOString() })),
    lastResult: input.lastResult && toStudentExerciseAttempt(input.questions, input.lastResult),
    pause: input.pause && {
      id: input.pause.id,
      initiatedBy: input.pause.initiatedBy,
      reason: input.pause.reason,
      note: input.pause.note,
      startedAt: input.pause.startedAt.toISOString(),
      endedAt: null,
    },
    // 016/FR-021: the history of the own exits, only once submitted; never who released them.
    pauses: input.submission
      ? input.pauses.map((pause) => ({
          id: pause.id,
          initiatedBy: pause.initiatedBy,
          reason: pause.reason,
          note: pause.note,
          startedAt: pause.startedAt.toISOString(),
          endedAt: pause.endedAt?.toISOString() ?? null,
        }))
      : [],
    exam: input.exam && toStudentExam(input.exam, input.facts.type !== "EXERCISE" && input.facts.released),
  };
}

/**
 * Before the result release both of the teacher's decisions on a hold read `WARNINGS` (018/FR-029,
 * research T13): the cancellation and its zero reach the student only with the release.
 */
function studentEndReason(endReason: ExamEndReason, released: boolean): StudentExamEndReason {
  if (endReason === "ENDED_BY_WARNINGS") return "WARNINGS";
  if (endReason === "CANCELLED") return released ? "CANCELLED" : "WARNINGS";
  return endReason;
}

/** An EXAM's facts as its student sees them (018 research T13), copied field by field. */
function toStudentExam(exam: StudentExamInput, released: boolean): StudentExam {
  return {
    durationMinutes: exam.durationMinutes,
    inactivityLimitSeconds: exam.inactivityLimitSeconds,
    startDeadline: exam.startDeadline.toISOString(),
    endsAt: exam.endsAt?.toISOString() ?? null,
    occurrences: { count: exam.occurrenceCount, warningsAllowed: EXAM_WARNINGS },
    hold: exam.hold && { openedAt: exam.hold.openedAt.toISOString() },
    endReason: exam.endReason && studentEndReason(exam.endReason, released),
    ownOccurrences: exam.ownOccurrences.map((occurrence) => ({ ordinal: occurrence.ordinal, kind: occurrence.kind, recordedAt: occurrence.recordedAt.toISOString() })),
  };
}

/**
 * A concluded EXERCISE attempt as its student sees it (013/FR-012, research K10): per question, the
 * student's answer, the result and points, "já pontuado", the answer key of its own type only (the
 * correct alternative, the expected answer or the reference solution), the explanation and the
 * teacher's comment. Copied field by field from the snapshot; never built for an attempt that is
 * not concluded, nor for another student's (the loader reads only the session student's). No rubric,
 * test case, trick flag or grading strategy, and no grade.
 */
export function toStudentExerciseAttempt(questions: readonly ActivityQuestionRow[], attempt: ConcludedAttemptInput): StudentExerciseAttempt {
  const first = attempt.number === 1;
  const results = new Map(attempt.results.map((row) => [row.questionId, row]));
  const answers = new Map(attempt.answers.map((row) => [row.questionId, row.answer]));
  return {
    number: attempt.number,
    completedAt: attempt.completedAt.toISOString(),
    first,
    pointsEarned: first ? attempt.results.reduce((sum, row) => sum + row.points, 0) : 0,
    questions: [...questions]
      .sort((a, b) => a.position - b.position)
      .flatMap((question) => {
        const result = results.get(question.id);
        if (!result) return [];
        return [
          {
            questionId: question.id,
            position: question.position,
            answer: answers.get(question.id) ?? null,
            result: result.result,
            points: result.points,
            alreadyScored: first && !result.scoring,
            correctAlternativeId:
              question.type === "MULTIPLE_CHOICE" ? (question.alternatives.find((alternative) => alternative.isCorrect)?.id ?? null) : null,
            expectedAnswer: question.type === "OPEN_ANSWER" ? question.expectedAnswer : null,
            expectedSolution: question.type === "CODE" ? question.expectedSolution : null,
            explanation: question.explanation ?? "",
            teacherComment: result.comment,
          },
        ];
      }),
  };
}

const person = (entry: { id: string; name: string }) => ({ id: entry.id, name: entry.name });

/** 023/FR-009: only ids and names of the group's members (never an e-mail or RA), copied field by field. */
function toStudentGroup(group: StudentGroupInput): NonNullable<StudentActivity["group"]> {
  return {
    groupSize: group.groupSize,
    leader: person(group.leader),
    members: group.members.map(person),
    editor: person(group.editor),
    myRole: group.myRole,
    canEdit: group.canEdit,
    addedBy: group.addedBy && person(group.addedBy),
    freeSlots: group.freeSlots,
    version: group.version,
  };
}

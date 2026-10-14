"use client";

import type {
  Answer,
  ExerciseResult,
  MarkExerciseResultsRequest,
  QuestionGradingView,
  RosterEntry,
  TeacherActivity,
  TeacherAttempt,
  TeacherExerciseResult,
  TeacherQuestion,
} from "@repo/contracts";
import {
  Award,
  CheckCircle2,
  Clock,
  Cpu,
  Eye,
  Hourglass,
  Inbox,
  UserCheck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, type ReactNode, useState } from "react";
import {
  ErrorSummary,
  Field,
  type FormError,
  SubmitButton,
} from "@/components/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code/code-block";
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLongDateTime } from "@/lib/messages/dates";
import { messageForError } from "@/lib/messages/error-messages";
import {
  isSubmissionVersionConflict,
  useActivity,
  useAttempt,
  useAttemptActions,
  useAttemptHelp,
} from "../hooks/use-activities";
import { EXAM_END_REASON_LABELS, helpsUsedLabel } from "../schemas/attempt-records";
import {
  AttemptHelpContext,
  IntegrityRecords,
  QuestionHelpRecords,
  ExamAttemptRecords,
  RoomExitRecords,
} from "./attempt-records";
import {
  formatGrade,
  formatPoints,
  QUESTION_TYPE_LABELS,
  ROSTER_STATUS_LABELS,
} from "../schemas/activity-form";
import {
  type AttemptGradingValues,
  attemptGradingDefaults,
  feedbackFieldId,
  GENERAL_FEEDBACK_FIELD_ID,
  gradeFieldId,
  toGradeSubmission,
} from "../schemas/attempt-grading";
import {
  commentFieldId,
  EXERCISE_RESULT_LABELS,
  EXERCISE_RESULT_VARIANTS,
  isMarkable,
  type MarkChoice,
  markDefaults,
  markFieldName,
  type MarkValues,
  pendingMarksLabel,
  toMarkRequest,
} from "../schemas/exercise-marks";
import { activityTabHref } from "./activity-tabs";
import { TextareaField } from "./form-fields";

export const GRADING_CONFLICT_NOTICE =
  "Esta correção mudou em outra aba. Mostramos a versão atual; revise antes de salvar.";

export interface AttemptReviewProps {
  classId: string;
  activityId: string;
  attemptId: string;
  /** `notas.lancar`: grade and accept (UX only; the API authorizes). */
  canGrade: boolean;
  /** `exercicios.corrigir`: mark an Exercício's answers right or wrong (013; UX only). */
  canMark: boolean;
}

/**
 * One student's attempt (012 contracts/web-ui.md, `/turmas/[id]/atividades/[activityId]/tentativas/
 * [attemptId]`): each answer next to the answer key, the automatic results marked "Corrigida
 * automaticamente", a grade ("0,00 a 0,05") and feedback per question, the general feedback and
 * "Salvar correção". A not-submitted attempt is read-only ("Não entregue") and, when the student can
 * no longer submit, "Aceitar como entrega" (FR-006b). An Exercício (013/US3) has no grade: each
 * answer shows its result, and the open answers and code of the first conclusion are marked "Certo"
 * or "Errado" with an optional comment. Links to the previous and next student.
 */
export function AttemptReview({
  classId,
  activityId,
  attemptId,
  canGrade,
  canMark,
}: AttemptReviewProps) {
  const activityQuery = useActivity(classId, activityId);
  const attemptQuery = useAttempt(classId, activityId, attemptId);
  const actions = useAttemptActions(classId, activityId, attemptId);
  // 015/US4: the helps of a work with the AI help on (the activity says so).
  const helpQuery = useAttemptHelp(
    classId,
    activityId,
    attemptId,
    (activityQuery.data?.aiHelp.allowance ?? 0) > 0,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const failure = activityQuery.error ?? attemptQuery.error;
  if (failure) return <p role="alert">{messageForError(failure)}</p>;
  if (!activityQuery.data || !attemptQuery.data) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Carregando a tentativa…</span>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  const activity = activityQuery.data;
  const attempt = attemptQuery.data;
  const entry = activity.roster.find((item) => item.attemptId === attempt.id);
  const submission = attempt.submission;
  const isExercise = activity.type === "EXERCISE";

  const accept = async () => {
    setNotice(null);
    setError(null);
    try {
      await actions.accept.mutateAsync();
      setNotice("Entrega aceita.");
    } catch (caught) {
      setError(messageForError(caught));
    }
  };
  /** Throws on a refusal: the marking form shows it in its error summary. */
  const saveMarks = async (marks: MarkExerciseResultsRequest["marks"]) => {
    setNotice(null);
    if (marks.length === 0) {
      setNotice("Nenhuma alteração para salvar.");
      return;
    }
    await actions.mark.mutateAsync({ marks });
    setNotice("Correção salva.");
  };
  const save = async (
    request: Parameters<typeof actions.grade.mutateAsync>[0],
  ) => {
    setNotice(null);
    try {
      await actions.grade.mutateAsync(request);
      setNotice("Correção salva.");
    } catch (caught) {
      if (!isSubmissionVersionConflict(caught)) throw caught;
      await actions.reload();
      setNotice(GRADING_CONFLICT_NOTICE);
    }
  };

  return (
    <section aria-labelledby="tentativa-titulo" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="m-0">
          <Link href={activityTabHref(classId, activityId, "alunos")}>
            Voltar para {activity.title}
          </Link>
        </p>
        <h2 id="tentativa-titulo" className="m-0 text-h2">
          Tentativa de {attempt.student.name}
        </h2>
        {error ? (
          <p role="alert" className="m-0 text-danger-text">
            {error}
          </p>
        ) : null}
        <p role="status" className={notice ? "m-0" : "sr-only"}>
          {notice ?? ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {isExercise ? (
            <ExerciseBadge concluded={attempt.exercise !== null} />
          ) : submission ? (
            <Badge variant="success">
              <CheckCircle2 aria-hidden="true" />
              {submission.late ? "Entregue com atraso" : "Entregue"}
            </Badge>
          ) : (
            <Badge variant="warning">
              <Inbox aria-hidden="true" />
              Não entregue
            </Badge>
          )}
          {submission?.acceptedByTeacher ? (
            <Badge variant="info">
              <UserCheck aria-hidden="true" />
              Entrega aceita pelo professor
            </Badge>
          ) : null}
          {submission?.gradePartial ? (
            <Badge variant="neutral">
              <Clock aria-hidden="true" />
              Correção pendente
            </Badge>
          ) : null}
        </div>
        <dl className="m-0 grid gap-2">
          {entry ? (
            <Item term="Situação">{ROSTER_STATUS_LABELS[entry.status]}</Item>
          ) : null}
          <Item term="Iniciada em">
            {formatLongDateTime(attempt.startedAt)}
          </Item>
          <Item term="Salva pela última vez em">
            {attempt.lastSavedAt
              ? formatLongDateTime(attempt.lastSavedAt)
              : "Nenhuma resposta salva"}
          </Item>
          {submission ? (
            <Item term="Entregue em">
              {formatLongDateTime(submission.submittedAt)}
            </Item>
          ) : null}
          {submission ? (
            <Item term="Nota">
              {formatGrade(submission.grade)} de{" "}
              {formatGrade(activity.totalGrade ?? "0.00")}
              {submission.gradePartial ? " (parcial)" : ""}
            </Item>
          ) : null}
          {submission ? (
            <Item term="Questões em branco">{submission.blankCount}</Item>
          ) : null}
          {/* 018/FR-031: an exam's end and why it ended, from the server's times. */}
          {attempt.exam ? (
            <>
              <Item term="Fim do tempo">{formatLongDateTime(attempt.exam.endsAt)}</Item>
              {attempt.exam.endedAt ? <Item term="Encerrada em">{formatLongDateTime(attempt.exam.endedAt)}</Item> : null}
              {attempt.exam.endReason ? <Item term="Motivo do fim">{EXAM_END_REASON_LABELS[attempt.exam.endReason]}</Item> : null}
            </>
          ) : null}
          {helpQuery.data ? (
            <Item term="Ajudas da IA usadas">
              {helpsUsedLabel(helpQuery.data.used, helpQuery.data.allowance)}
            </Item>
          ) : null}
          {attempt.exercise ? (
            <Item term="Concluída em">
              {formatLongDateTime(attempt.exercise.completedAt)}
            </Item>
          ) : null}
          {attempt.exercise?.number === 1 ? (
            <>
              <Item term="Pontos">
                {attempt.exercise.results.reduce(
                  (sum, row) => sum + row.points,
                  0,
                )}{" "}
                de {formatPoints(activity.possiblePoints ?? 0)}
              </Item>
              <Item term="Correção">
                {pendingMarksLabel(
                  attempt.exercise.results.filter(
                    (row) => row.result === "PENDING_TEACHER",
                  ).length,
                )}
              </Item>
            </>
          ) : null}
        </dl>
        {attempt.exercise && attempt.exercise.number > 1 ? (
          <p className="m-0">
            Tentativa {attempt.exercise.number}: prática. Não vale pontos e não
            vai para a correção.
          </p>
        ) : null}
        {!submission &&
        canGrade &&
        entry?.status === "MISSED" &&
        attempt.answers.length > 0 &&
        attempt.lastSavedAt ? (
          <AcceptAction lastSavedAt={attempt.lastSavedAt} onConfirm={accept} />
        ) : null}
      </div>

      {!isExercise && activity.executionMode === "CONTROLLED" ? (
        <IntegrityRecords
          classId={classId}
          activityId={activityId}
          attemptId={attempt.id}
        />
      ) : null}

      {/* 018/US8: an exam's numbered occurrences and the decisions on its holds. */}
      {attempt.exam ? <ExamAttemptRecords exam={attempt.exam} /> : null}

      {/* 016/US4: the room exits of a work that takes attendance. */}
      {!isExercise && activity.releaseMode === "PRESENT_ONLY" ? (
        <RoomExitRecords classId={classId} activityId={activityId} attemptId={attempt.id} />
      ) : null}

      <AttemptHelpContext.Provider value={helpQuery.data?.items ?? null}>
        {isExercise ? (
          <ExerciseReview
            activity={activity}
            attempt={attempt}
            canMark={canMark}
            onSave={saveMarks}
          />
        ) : submission && canGrade ? (
          // Keyed by version: a save or another tab's change loads the correction again.
          <GradingForm
            key={submission.version}
            activity={activity}
            attempt={attempt}
            onSave={save}
          />
        ) : (
          <ol
            aria-label="Respostas"
            className="m-0 flex list-none flex-col gap-4 p-0"
          >
            {activity.questions.map((question) => (
              <QuestionReview
                key={question.id}
                question={question}
                attempt={attempt}
              />
            ))}
          </ol>
        )}
      </AttemptHelpContext.Provider>

      <StudentNavigation
        classId={classId}
        activity={activity}
        attemptId={attempt.id}
      />
    </section>
  );
}

function AcceptAction({
  lastSavedAt,
  onConfirm,
}: {
  lastSavedAt: string;
  onConfirm: () => Promise<void>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="secondary" className="w-fit">
          <UserCheck aria-hidden="true" />
          Aceitar como entrega
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Aceitar esta tentativa como entrega?
          </AlertDialogTitle>
          <AlertDialogDescription>
            As respostas salvas até {formatLongDateTime(lastSavedAt)} viram a
            entrega deste aluno, marcada como atrasada.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onConfirm()}>
            Aceitar como entrega
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function GradingForm({
  activity,
  attempt,
  onSave,
}: {
  activity: TeacherActivity;
  attempt: TeacherAttempt;
  onSave: (
    request: ReturnType<typeof toGradeSubmission>["request"],
  ) => Promise<void>;
}) {
  const [values, setValues] = useState<AttemptGradingValues>(() =>
    attemptGradingDefaults(attempt),
  );
  const [errors, setErrors] = useState<FormError[]>([]);
  const [pending, setPending] = useState(false);
  const errorFor = (fieldId: string) =>
    errors.find((item) => item.fieldId === fieldId)?.message;
  const setQuestion = (
    questionId: string,
    field: "grade" | "feedback",
    value: string,
  ) =>
    setValues((current) => ({
      ...current,
      questions: {
        ...current.questions,
        [questionId]: {
          ...(current.questions[questionId] ?? { grade: "", feedback: "" }),
          [field]: value,
        },
      },
    }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const { request, errors: invalid } = toGradeSubmission(
      values,
      attempt,
      activity.questions,
    );
    setErrors(invalid);
    if (invalid.length > 0) return;
    setPending(true);
    try {
      await onSave(request);
    } catch (caught) {
      setErrors([{ message: messageForError(caught) }]);
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      noValidate
      aria-label="Correção"
      className="flex flex-col gap-4"
      onSubmit={(event) => void submit(event)}
    >
      <ErrorSummary
        errors={errors}
        title="Não foi possível salvar a correção"
      />
      <ol
        aria-label="Respostas"
        className="m-0 flex list-none flex-col gap-4 p-0"
      >
        {activity.questions.map((question) => {
          const gradeId = gradeFieldId(question.position);
          const feedbackId = feedbackFieldId(question.position);
          const typed = values.questions[question.id] ?? {
            grade: "",
            feedback: "",
          };
          return (
            <QuestionReview
              key={question.id}
              question={question}
              attempt={attempt}
            >
              <div className="max-w-160">
                <Field
                  id={gradeId}
                  name={gradeId}
                  label={`Nota da questão ${question.position + 1}`}
                  hint={`0,00 a ${formatGrade(question.value ?? "0.00")}`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={typed.grade}
                  error={errorFor(gradeId)}
                  onChange={(event) =>
                    setQuestion(question.id, "grade", event.target.value)
                  }
                />
                <TextareaField
                  id={feedbackId}
                  name={feedbackId}
                  label={`Feedback da questão ${question.position + 1}`}
                  hint="Opcional."
                  value={typed.feedback}
                  onChange={(event) =>
                    setQuestion(question.id, "feedback", event.target.value)
                  }
                />
              </div>
            </QuestionReview>
          );
        })}
      </ol>
      <div className="max-w-160">
        <TextareaField
          id={GENERAL_FEEDBACK_FIELD_ID}
          name={GENERAL_FEEDBACK_FIELD_ID}
          label="Feedback geral"
          hint="Opcional."
          value={values.generalFeedback}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              generalFeedback: event.target.value,
            }))
          }
        />
        <SubmitButton pending={pending} pendingLabel="Salvando…">
          Salvar correção
        </SubmitButton>
      </div>
    </form>
  );
}

function ExerciseBadge({ concluded }: { concluded: boolean }) {
  return concluded ? (
    <Badge variant="success">
      <CheckCircle2 aria-hidden="true" />
      Concluída
    </Badge>
  ) : (
    <Badge variant="warning">
      <Inbox aria-hidden="true" />
      Não concluída
    </Badge>
  );
}

/**
 * The Exercício's answers (013/US3): with `exercicios.corrigir` and something to mark on the first
 * conclusion, the marking form; otherwise each result read-only.
 */
function ExerciseReview({
  activity,
  attempt,
  canMark,
  onSave,
}: {
  activity: TeacherActivity;
  attempt: TeacherAttempt;
  canMark: boolean;
  onSave: (marks: MarkExerciseResultsRequest["marks"]) => Promise<void>;
}) {
  const results = new Map(
    (attempt.exercise?.results ?? []).map((row) => [row.questionId, row]),
  );
  const markable =
    attempt.exercise !== null &&
    activity.questions.some((question) => {
      const row = results.get(question.id);
      return row !== undefined && isMarkable(row, question);
    });
  if (canMark && markable) {
    // Keyed by the stored marks: a save or another tab's change loads them again.
    const key = (attempt.exercise?.results ?? [])
      .map((row) => `${row.result}:${row.decidedAt ?? ""}:${row.comment ?? ""}`)
      .join("|");
    return (
      <MarkingForm
        key={key}
        activity={activity}
        attempt={attempt}
        results={results}
        onSave={onSave}
      />
    );
  }
  return (
    <ol
      aria-label="Respostas"
      className="m-0 flex list-none flex-col gap-4 p-0"
    >
      {activity.questions.map((question) => (
        <QuestionReview
          key={question.id}
          question={question}
          attempt={attempt}
          result={results.get(question.id)}
        />
      ))}
    </ol>
  );
}

function MarkingForm({
  activity,
  attempt,
  results,
  onSave,
}: {
  activity: TeacherActivity;
  attempt: TeacherAttempt;
  results: Map<string, TeacherExerciseResult>;
  onSave: (marks: MarkExerciseResultsRequest["marks"]) => Promise<void>;
}) {
  const [values, setValues] = useState<MarkValues>(() =>
    markDefaults(attempt, activity.questions),
  );
  const [errors, setErrors] = useState<FormError[]>([]);
  const [pending, setPending] = useState(false);
  const setMark = (questionId: string, change: Partial<MarkValues[string]>) =>
    setValues((current) => ({
      ...current,
      [questionId]: {
        ...(current[questionId] ?? { result: "", comment: "" }),
        ...change,
      },
    }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setErrors([]);
    setPending(true);
    try {
      await onSave(toMarkRequest(values, attempt));
    } catch (caught) {
      setErrors([{ message: messageForError(caught) }]);
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      noValidate
      aria-label="Correção"
      className="flex flex-col gap-4"
      onSubmit={(event) => void submit(event)}
    >
      <ErrorSummary
        errors={errors}
        title="Não foi possível salvar a correção"
      />
      <ol
        aria-label="Respostas"
        className="m-0 flex list-none flex-col gap-4 p-0"
      >
        {activity.questions.map((question) => {
          const row = results.get(question.id);
          const typed = values[question.id];
          if (!row || !typed || !isMarkable(row, question)) {
            return (
              <QuestionReview
                key={question.id}
                question={question}
                attempt={attempt}
                result={row}
              />
            );
          }
          const name = markFieldName(question.position);
          const commentId = commentFieldId(question.position);
          return (
            <QuestionReview
              key={question.id}
              question={question}
              attempt={attempt}
              result={row}
              marking
            >
              <div className="max-w-160">
                <RadioGroup
                  legend={`Correção do exercício ${question.position + 1}`}
                  className="mb-4"
                >
                  {(
                    [
                      "CORRECT",
                      "WRONG",
                    ] as const satisfies readonly MarkChoice[]
                  ).map((choice) => (
                    <div
                      key={choice}
                      className="flex min-h-11 items-center gap-2"
                    >
                      <Radio
                        id={`${name}-${choice}`}
                        name={name}
                        value={choice}
                        checked={typed.result === choice}
                        onChange={() =>
                          setMark(question.id, { result: choice })
                        }
                      />
                      <Label htmlFor={`${name}-${choice}`}>
                        {EXERCISE_RESULT_LABELS[choice]}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                <TextareaField
                  id={commentId}
                  name={commentId}
                  label={`Comentário do exercício ${question.position + 1} (opcional)`}
                  value={typed.comment}
                  onChange={(event) =>
                    setMark(question.id, { comment: event.target.value })
                  }
                />
              </div>
            </QuestionReview>
          );
        })}
      </ol>
      <div className="max-w-160">
        <SubmitButton pending={pending} pendingLabel="Salvando…">
          Salvar correção
        </SubmitButton>
      </div>
    </form>
  );
}

const RESULT_ICONS: Record<ExerciseResult, typeof CheckCircle2> = {
  CORRECT: CheckCircle2,
  WRONG: XCircle,
  PENDING_TEACHER: Hourglass,
  UNSCORED: Eye,
};

/** An exercise's result by text and icon, never by color alone; who decided it and "já pontuado". */
function ExerciseResultBadges({
  row,
  question,
}: {
  row: TeacherExerciseResult;
  question: TeacherQuestion;
}) {
  const Icon = RESULT_ICONS[row.result];
  return (
    <>
      <Badge variant={EXERCISE_RESULT_VARIANTS[row.result]}>
        <Icon aria-hidden="true" />
        {EXERCISE_RESULT_LABELS[row.result]}
      </Badge>
      {row.nature === "RULE_RESULT" &&
      row.scoring &&
      question.type === "MULTIPLE_CHOICE" ? (
        <Badge variant="neutral">
          <Cpu aria-hidden="true" />
          Corrigido automaticamente
        </Badge>
      ) : null}
      {row.alreadyScored ? (
        <Badge variant="neutral">
          <Award aria-hidden="true" />
          Já pontuado em outra atividade
        </Badge>
      ) : null}
      {row.scoring ? <span>{formatPoints(row.points)}</span> : null}
    </>
  );
}

const GRADING_LABELS: Record<QuestionGradingView["status"], string> = {
  GRADED: "Corrigida automaticamente",
  PENDING_TEACHER: "Correção pendente",
  DECIDED: "Corrigida pelo professor",
};

/**
 * One question: the student's answer next to the answer key, and its grading once submitted or, for
 * an Exercício, its result (the teacher's comment read-only unless `marking`).
 */
function QuestionReview({
  question,
  attempt,
  result,
  marking = false,
  children,
}: {
  question: TeacherQuestion;
  attempt: TeacherAttempt;
  result?: TeacherExerciseResult;
  marking?: boolean;
  children?: ReactNode;
}) {
  const answer =
    attempt.answers.find((item) => item.questionId === question.id)?.answer ??
    null;
  const grading =
    attempt.submission?.gradings.find(
      (item) => item.questionId === question.id,
    ) ?? null;
  const headingId = `questao-${question.position + 1}-titulo`;
  return (
    <li
      aria-labelledby={headingId}
      className="flex flex-col gap-2 rounded-md border border-border p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={headingId} className="m-0 text-h3">
          {question.points !== null ? "Exercício" : "Questão"}{" "}
          {question.position + 1}
        </h3>
        <span>{QUESTION_TYPE_LABELS[question.type]}</span>
        <span>
          Vale{" "}
          {question.value !== null
            ? formatGrade(question.value ?? "0.00")
            : formatPoints(question.points ?? 0)}
        </span>
        {grading ? (
          <Badge
            variant={
              grading.status === "PENDING_TEACHER" ? "warning" : "neutral"
            }
          >
            {GRADING_LABELS[grading.status]}
          </Badge>
        ) : null}
        {result ? (
          <ExerciseResultBadges row={result} question={question} />
        ) : null}
      </div>
      <dl className="m-0 flex flex-col gap-2">
        <Item term="Enunciado">{question.statement}</Item>
        <Item term="Resposta do aluno">
          <StudentAnswer question={question} answer={answer} />
        </Item>
        {question.expectedAnswer !== null ? (
          <Item term="Resposta esperada">{question.expectedAnswer}</Item>
        ) : null}
        {question.rubric !== null ? (
          <Item term="Rubrica">{question.rubric}</Item>
        ) : null}
        {question.expectedSolution !== null ? (
          <Item term="Solução esperada">
            <CodeBlock
              label="Solução esperada"
              code={question.expectedSolution}
              highlight={question.language?.highlight}
            />
          </Item>
        ) : null}
        {question.testCases.length > 0 ? (
          <Item term="Casos de teste">
            <ul className="m-0 pl-6">
              {question.testCases.map((testCase) => (
                <li key={testCase.position}>
                  Entrada: {testCase.input || "(vazia)"} · Saída:{" "}
                  {testCase.expectedOutput || "(vazia)"} ·{" "}
                  {testCase.visibility === "PUBLIC" ? "público" : "privado"}
                </li>
              ))}
            </ul>
          </Item>
        ) : null}
        {question.explanation !== null ? (
          <Item term="Explicação">{question.explanation}</Item>
        ) : null}
        {grading && !children ? (
          <>
            <Item term="Nota">
              {grading.finalGrade === null
                ? "Correção pendente"
                : `${formatGrade(grading.finalGrade)} de ${formatGrade(question.value ?? "0.00")}`}
            </Item>
            {grading.feedback ? (
              <Item term="Feedback">{grading.feedback}</Item>
            ) : null}
          </>
        ) : null}
        {result?.comment && !marking ? (
          <Item term="Comentário do professor">{result.comment}</Item>
        ) : null}
      </dl>
      <QuestionHelpRecords question={question} />
      {children}
    </li>
  );
}

/** The answer as text (never HTML): the alternatives with the chosen and the correct one marked. */
function StudentAnswer({
  question,
  answer,
}: {
  question: TeacherQuestion;
  answer: Answer | null;
}) {
  if (answer?.kind === "ALTERNATIVE") {
    return (
      <ol className="m-0 pl-6">
        {question.alternatives.map((alternative) => (
          <li key={alternative.id}>
            {alternative.text}
            {alternative.id === answer.alternativeId ? (
              <strong> (escolhida)</strong>
            ) : null}
            {alternative.isCorrect ? <strong> (correta)</strong> : null}
          </li>
        ))}
      </ol>
    );
  }
  if (answer?.kind === "TEXT" && answer.text.trim() !== "")
    return <>{answer.text}</>;
  if (answer?.kind === "CODE" && answer.source.trim() !== "")
    return (
      <CodeBlock
        label="Resposta do aluno"
        code={answer.source}
        highlight={question.language?.highlight}
      />
    );
  return <>Em branco</>;
}

/** Previous and next student with an attempt, in the roster's order. */
function StudentNavigation({
  classId,
  activity,
  attemptId,
}: {
  classId: string;
  activity: TeacherActivity;
  attemptId: string;
}) {
  const withAttempt = activity.roster.filter(
    (entry): entry is RosterEntry & { attemptId: string } =>
      entry.attemptId !== null,
  );
  const index = withAttempt.findIndex((entry) => entry.attemptId === attemptId);
  const previous = index > 0 ? withAttempt[index - 1] : undefined;
  const next = index >= 0 ? withAttempt[index + 1] : undefined;
  if (!previous && !next) return null;
  const href = (entry: { attemptId: string }) =>
    `/turmas/${classId}/atividades/${activity.id}/tentativas/${entry.attemptId}`;
  return (
    <nav aria-label="Outros alunos" className="flex flex-wrap gap-4">
      {previous ? (
        <Link href={href(previous)}>Aluno anterior: {previous.name}</Link>
      ) : null}
      {next ? <Link href={href(next)}>Próximo aluno: {next.name}</Link> : null}
    </nav>
  );
}

function Item({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-label text-text-secondary">{term}</dt>
      <dd className="m-0 whitespace-pre-wrap">{children}</dd>
    </div>
  );
}

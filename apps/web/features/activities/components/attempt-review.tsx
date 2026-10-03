"use client";

import type { Answer, QuestionGradingView, RosterEntry, TeacherActivity, TeacherAttempt, TeacherQuestion } from "@repo/contracts";
import { CheckCircle2, Clock, Inbox, UserCheck } from "lucide-react";
import Link from "next/link";
import { type FormEvent, type ReactNode, useState } from "react";
import { ErrorSummary, Field, type FormError, SubmitButton } from "@/components/shared";
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
import { Skeleton } from "@/components/ui/skeleton";
import { formatLongDateTime } from "@/lib/messages/dates";
import { messageForError } from "@/lib/messages/error-messages";
import { isSubmissionVersionConflict, useActivity, useAttempt, useAttemptActions } from "../hooks/use-activities";
import { formatGrade, QUESTION_TYPE_LABELS, ROSTER_STATUS_LABELS } from "../schemas/activity-form";
import {
  type AttemptGradingValues,
  attemptGradingDefaults,
  feedbackFieldId,
  GENERAL_FEEDBACK_FIELD_ID,
  gradeFieldId,
  toGradeSubmission,
} from "../schemas/attempt-grading";
import { TextareaField } from "./form-fields";

export const GRADING_CONFLICT_NOTICE = "Esta correção mudou em outra aba. Mostramos a versão atual; revise antes de salvar.";

export interface AttemptReviewProps {
  classId: string;
  activityId: string;
  attemptId: string;
  /** `notas.lancar`: grade and accept (UX only; the API authorizes). */
  canGrade: boolean;
}

/**
 * One student's attempt (012 contracts/web-ui.md, `/turmas/[id]/atividades/[activityId]/tentativas/
 * [attemptId]`): each answer next to the answer key, the automatic results marked "Corrigida
 * automaticamente", a grade ("0,00 a 0,05") and feedback per question, the general feedback and
 * "Salvar correção". A not-submitted attempt is read-only ("Não entregue") and, when the student can
 * no longer submit, "Aceitar como entrega" (FR-006b). Links to the previous and next student.
 */
export function AttemptReview({ classId, activityId, attemptId, canGrade }: AttemptReviewProps) {
  const activityQuery = useActivity(classId, activityId);
  const attemptQuery = useAttempt(classId, activityId, attemptId);
  const actions = useAttemptActions(classId, activityId, attemptId);
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
  const save = async (request: Parameters<typeof actions.grade.mutateAsync>[0]) => {
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
          <Link href={`/turmas/${classId}/atividades/${activityId}`}>Voltar para {activity.title}</Link>
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
          {submission ? (
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
          {entry ? <Item term="Situação">{ROSTER_STATUS_LABELS[entry.status]}</Item> : null}
          <Item term="Iniciada em">{formatLongDateTime(attempt.startedAt)}</Item>
          <Item term="Salva pela última vez em">{attempt.lastSavedAt ? formatLongDateTime(attempt.lastSavedAt) : "Nenhuma resposta salva"}</Item>
          {submission ? <Item term="Entregue em">{formatLongDateTime(submission.submittedAt)}</Item> : null}
          {submission ? (
            <Item term="Nota">
              {formatGrade(submission.grade)} de {formatGrade(activity.totalGrade)}
              {submission.gradePartial ? " (parcial)" : ""}
            </Item>
          ) : null}
          {submission ? <Item term="Questões em branco">{submission.blankCount}</Item> : null}
        </dl>
        {!submission && canGrade && entry?.status === "MISSED" && attempt.answers.length > 0 && attempt.lastSavedAt ? (
          <AcceptAction lastSavedAt={attempt.lastSavedAt} onConfirm={accept} />
        ) : null}
      </div>

      {submission && canGrade ? (
        // Keyed by version: a save or another tab's change loads the correction again.
        <GradingForm key={submission.version} activity={activity} attempt={attempt} onSave={save} />
      ) : (
        <ol aria-label="Respostas" className="m-0 flex list-none flex-col gap-4 p-0">
          {activity.questions.map((question) => (
            <QuestionReview key={question.id} question={question} attempt={attempt} />
          ))}
        </ol>
      )}

      <StudentNavigation classId={classId} activity={activity} attemptId={attempt.id} />
    </section>
  );
}

function AcceptAction({ lastSavedAt, onConfirm }: { lastSavedAt: string; onConfirm: () => Promise<void> }) {
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
          <AlertDialogTitle>Aceitar esta tentativa como entrega?</AlertDialogTitle>
          <AlertDialogDescription>
            As respostas salvas até {formatLongDateTime(lastSavedAt)} viram a entrega deste aluno, marcada como atrasada.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onConfirm()}>Aceitar como entrega</AlertDialogAction>
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
  onSave: (request: ReturnType<typeof toGradeSubmission>["request"]) => Promise<void>;
}) {
  const [values, setValues] = useState<AttemptGradingValues>(() => attemptGradingDefaults(attempt));
  const [errors, setErrors] = useState<FormError[]>([]);
  const [pending, setPending] = useState(false);
  const errorFor = (fieldId: string) => errors.find((item) => item.fieldId === fieldId)?.message;
  const setQuestion = (questionId: string, field: "grade" | "feedback", value: string) =>
    setValues((current) => ({
      ...current,
      questions: { ...current.questions, [questionId]: { ...(current.questions[questionId] ?? { grade: "", feedback: "" }), [field]: value } },
    }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const { request, errors: invalid } = toGradeSubmission(values, attempt, activity.questions);
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
    <form noValidate aria-label="Correção" className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      <ErrorSummary errors={errors} title="Não foi possível salvar a correção" />
      <ol aria-label="Respostas" className="m-0 flex list-none flex-col gap-4 p-0">
        {activity.questions.map((question) => {
          const gradeId = gradeFieldId(question.position);
          const feedbackId = feedbackFieldId(question.position);
          const typed = values.questions[question.id] ?? { grade: "", feedback: "" };
          return (
            <QuestionReview key={question.id} question={question} attempt={attempt}>
              <div className="max-w-160">
                <Field
                  id={gradeId}
                  name={gradeId}
                  label={`Nota da questão ${question.position + 1}`}
                  hint={`0,00 a ${formatGrade(question.value)}`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={typed.grade}
                  error={errorFor(gradeId)}
                  onChange={(event) => setQuestion(question.id, "grade", event.target.value)}
                />
                <TextareaField
                  id={feedbackId}
                  name={feedbackId}
                  label={`Feedback da questão ${question.position + 1}`}
                  hint="Opcional."
                  value={typed.feedback}
                  onChange={(event) => setQuestion(question.id, "feedback", event.target.value)}
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
          onChange={(event) => setValues((current) => ({ ...current, generalFeedback: event.target.value }))}
        />
        <SubmitButton pending={pending} pendingLabel="Salvando…">
          Salvar correção
        </SubmitButton>
      </div>
    </form>
  );
}

const GRADING_LABELS: Record<QuestionGradingView["status"], string> = {
  GRADED: "Corrigida automaticamente",
  PENDING_TEACHER: "Correção pendente",
  DECIDED: "Corrigida pelo professor",
};

/** One question: the student's answer next to the answer key, and its grading once submitted. */
function QuestionReview({ question, attempt, children }: { question: TeacherQuestion; attempt: TeacherAttempt; children?: ReactNode }) {
  const answer = attempt.answers.find((item) => item.questionId === question.id)?.answer ?? null;
  const grading = attempt.submission?.gradings.find((item) => item.questionId === question.id) ?? null;
  const headingId = `questao-${question.position + 1}-titulo`;
  return (
    <li aria-labelledby={headingId} className="flex flex-col gap-2 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={headingId} className="m-0 text-h3">
          Questão {question.position + 1}
        </h3>
        <span>{QUESTION_TYPE_LABELS[question.type]}</span>
        <span>Vale {formatGrade(question.value)}</span>
        {grading ? (
          <Badge variant={grading.status === "PENDING_TEACHER" ? "warning" : "neutral"}>{GRADING_LABELS[grading.status]}</Badge>
        ) : null}
      </div>
      <dl className="m-0 flex flex-col gap-2">
        <Item term="Enunciado">{question.statement}</Item>
        <Item term="Resposta do aluno">
          <StudentAnswer question={question} answer={answer} />
        </Item>
        {question.expectedAnswer !== null ? <Item term="Resposta esperada">{question.expectedAnswer}</Item> : null}
        {question.rubric !== null ? <Item term="Rubrica">{question.rubric}</Item> : null}
        {question.expectedSolution !== null ? <Item term="Solução esperada">{question.expectedSolution}</Item> : null}
        {question.testCases.length > 0 ? (
          <Item term="Casos de teste">
            <ul className="m-0 pl-6">
              {question.testCases.map((testCase) => (
                <li key={testCase.position}>
                  Entrada: {testCase.input || "(vazia)"} · Saída: {testCase.expectedOutput || "(vazia)"} ·{" "}
                  {testCase.visibility === "PUBLIC" ? "público" : "privado"}
                </li>
              ))}
            </ul>
          </Item>
        ) : null}
        {question.explanation !== null ? <Item term="Explicação">{question.explanation}</Item> : null}
        {grading && !children ? (
          <>
            <Item term="Nota">{grading.finalGrade === null ? "Correção pendente" : `${formatGrade(grading.finalGrade)} de ${formatGrade(question.value)}`}</Item>
            {grading.feedback ? <Item term="Feedback">{grading.feedback}</Item> : null}
          </>
        ) : null}
      </dl>
      {children}
    </li>
  );
}

/** The answer as text (never HTML): the alternatives with the chosen and the correct one marked. */
function StudentAnswer({ question, answer }: { question: TeacherQuestion; answer: Answer | null }) {
  if (answer?.kind === "ALTERNATIVE") {
    return (
      <ol className="m-0 pl-6">
        {question.alternatives.map((alternative) => (
          <li key={alternative.id}>
            {alternative.text}
            {alternative.id === answer.alternativeId ? <strong> (escolhida)</strong> : null}
            {alternative.isCorrect ? <strong> (correta)</strong> : null}
          </li>
        ))}
      </ol>
    );
  }
  if (answer?.kind === "TEXT" && answer.text.trim() !== "") return <>{answer.text}</>;
  if (answer?.kind === "CODE" && answer.source.trim() !== "") return <>{answer.source}</>;
  return <>Em branco</>;
}

/** Previous and next student with an attempt, in the roster's order. */
function StudentNavigation({ classId, activity, attemptId }: { classId: string; activity: TeacherActivity; attemptId: string }) {
  const withAttempt = activity.roster.filter((entry): entry is RosterEntry & { attemptId: string } => entry.attemptId !== null);
  const index = withAttempt.findIndex((entry) => entry.attemptId === attemptId);
  const previous = index > 0 ? withAttempt[index - 1] : undefined;
  const next = index >= 0 ? withAttempt[index + 1] : undefined;
  if (!previous && !next) return null;
  const href = (entry: { attemptId: string }) => `/turmas/${classId}/atividades/${activity.id}/tentativas/${entry.attemptId}`;
  return (
    <nav aria-label="Outros alunos" className="flex flex-wrap gap-4">
      {previous ? <Link href={href(previous)}>Aluno anterior: {previous.name}</Link> : null}
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

"use client";

import type { StudentActivity, StudentQuestion } from "@repo/contracts";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CodeAnswer, EssayAnswer, MultipleChoiceAnswer } from "@/components/ui/assessment/answers";
import { AssessmentFooter } from "@/components/ui/assessment/assessment-footer";
import { QuestionHeader, QuestionStatement } from "@/components/ui/assessment/question";
import { ExamProgress, QuestionNavigator } from "@/components/ui/assessment/question-navigator";
import { SaveStatus } from "@/components/ui/assessment/save-status";
import { Button } from "@/components/ui/button";
import { Status } from "@/components/ui/status";
import { formatLongDateTime } from "@/lib/messages/dates";
import { messageForError } from "@/lib/messages/error-messages";
import { useAttemptAnswers } from "../hooks/use-attempt-answers";
import { useDeadlineWarning } from "../hooks/use-deadline-warning";
import { useStartAttempt, useStudentActivity } from "../hooks/use-student-activities";
import {
  ACTIVITY_TYPE_LABELS,
  emptyAnswer,
  ESSAY_MAX_LENGTH,
  formatGrade,
  isAnswered,
  MY_ACTIVITIES_PATH,
  QUESTION_TYPE_LABELS,
  STATUS_VARIANTS,
  statusLabel,
  valueLabel,
} from "../schemas/student-activity";
import { Loading, LoadFailed } from "./load-states";

export const OFFLINE_ALERT =
  "Você está sem conexão. Suas respostas ficam guardadas neste navegador e serão enviadas quando a conexão voltar.";
export const CONFLICT_ALERT = "Esta resposta foi alterada em outra aba. Carregamos a versão mais recente.";
export const DEADLINE_WARNINGS = {
  10: "Faltam 10 minutos para o prazo desta atividade.",
  1: "Falta 1 minuto para o prazo desta atividade.",
} as const;

/**
 * One activity of the student (012 US3, contracts/web-ui.md "/minhas-atividades/[id]"): its header,
 * "Iniciar atividade", then the answering screen in the NORMAL mode of the Exam Mode contract.
 * Whether the student may answer (`canAnswer`) and the situation come from the API; the screen only
 * shows them. Texts render as text.
 */
export function ActivityAnswering({ activityId, userId }: { activityId: string; userId: string }) {
  const query = useStudentActivity(activityId);
  if (query.isPending) {
    return (
      <>
        <PageHeader title="Atividade" breadcrumb={[{ label: "Minhas atividades", href: MY_ACTIVITIES_PATH }, { label: "Atividade" }]} />
        <Loading label="Carregando a atividade…" />
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        <PageHeader title="Atividade" breadcrumb={[{ label: "Minhas atividades", href: MY_ACTIVITIES_PATH }, { label: "Atividade" }]} />
        <LoadFailed error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  }
  return <ActivityView activity={query.data} userId={userId} />;
}

function ActivityView({ activity, userId }: { activity: StudentActivity; userId: string }) {
  return (
    <>
      <PageHeader
        title={activity.title}
        breadcrumb={[{ label: "Minhas atividades", href: MY_ACTIVITIES_PATH }, { label: activity.title }]}
        status={<Status variant={STATUS_VARIANTS[activity.status]}>{statusLabel(activity)}</Status>}
      />
      <div className="flex flex-col gap-8">
        <ActivityDetails activity={activity} />
        {activity.attempt ? (
          <AttemptAnswering activity={activity} userId={userId} />
        ) : (
          <StartAttempt activity={activity} />
        )}
      </div>
    </>
  );
}

function ActivityDetails({ activity }: { activity: StudentActivity }) {
  return (
    <section aria-label="Sobre a atividade" className="flex flex-col gap-4">
      <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-body-sm">
        <dt className="text-text-secondary">Turma</dt>
        <dd className="m-0">{activity.subjectName ? `${activity.class.name} · ${activity.subjectName}` : activity.class.name}</dd>
        <dt className="text-text-secondary">Professor</dt>
        <dd className="m-0">{activity.teacherName}</dd>
        <dt className="text-text-secondary">Tipo</dt>
        <dd className="m-0">{ACTIVITY_TYPE_LABELS[activity.type]}</dd>
        <dt className="text-text-secondary">Publicada em</dt>
        <dd className="m-0">{formatLongDateTime(activity.publishedAt)}</dd>
        <dt className="text-text-secondary">Prazo</dt>
        <dd className="m-0">{formatLongDateTime(activity.deadline)}</dd>
        <dt className="text-text-secondary">Nota total</dt>
        <dd className="m-0">{formatGrade(activity.totalGrade)}</dd>
      </dl>
      {activity.instructions ? (
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-h3">Instruções</h2>
          <p className="m-0 text-reading whitespace-pre-wrap">{activity.instructions}</p>
        </div>
      ) : null}
    </section>
  );
}

function StartAttempt({ activity }: { activity: StudentActivity }) {
  const start = useStartAttempt(activity.id);
  if (!activity.canAnswer) {
    return (
      <Alert variant="info">
        <AlertTitle>Esta atividade não aceita mais respostas.</AlertTitle>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="m-0 text-body">
        {activity.questions.length === 1 ? "1 questão" : `${activity.questions.length} questões`}. Suas respostas são salvas
        automaticamente.
      </p>
      <Button type="button" loading={start.isPending} onClick={() => start.mutate()}>
        Iniciar atividade
      </Button>
      {start.isError ? (
        <Alert variant="danger">
          <AlertTitle>{messageForError(start.error)}</AlertTitle>
        </Alert>
      ) : null}
    </div>
  );
}

/** A refusal by a rule (409/422/404): its reason replaces the "tentaremos de novo" of a transient failure. */
const isRefusal = (status: number) => status >= 400 && status < 500 && status !== 429;

function AttemptAnswering({ activity, userId }: { activity: StudentActivity; userId: string }) {
  const editable = activity.canAnswer && activity.submission === null;
  const answers = useAttemptAnswers({
    userId,
    activityId: activity.id,
    serverAnswers: activity.attempt?.answers ?? [],
    enabled: editable,
  });
  const [index, setIndex] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const warning = useDeadlineWarning(activity.deadline, activity.serverNow, editable);
  const questions = activity.questions;
  const question = questions[index]!;
  const answeredCount = questions.filter((item) => isAnswered(item, answers.answerOf(item.id))).length;
  const refused = answers.error !== null && isRefusal(answers.error.status);

  useEffect(() => {
    // The focus follows a question change made by the student, never the first render.
    if (moved.current) heading.current?.focus();
  }, [index]);

  const goTo = (next: number) => {
    answers.flush();
    moved.current = true;
    setIndex(next);
  };

  return (
    <section aria-labelledby="respostas" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="respostas" className="m-0 text-h3">
          Respostas
        </h2>
        {editable ? <SaveStatus state={refused ? "idle" : answers.saveState} onRetry={answers.retry} /> : null}
      </div>
      {warning ? (
        <Alert variant="warning">
          <AlertTitle>{DEADLINE_WARNINGS[warning]}</AlertTitle>
        </Alert>
      ) : null}
      {answers.offline ? (
        <Alert variant="warning">
          <AlertTitle>{OFFLINE_ALERT}</AlertTitle>
        </Alert>
      ) : null}
      {answers.conflict ? (
        <Alert variant="info">
          <AlertTitle>{CONFLICT_ALERT}</AlertTitle>
          <AlertDescription>
            <Button type="button" variant="secondary" size="sm" onClick={answers.dismissConflict}>
              Entendi
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {refused ? (
        <Alert variant="danger">
          <AlertTitle>{messageForError(answers.error)}</AlertTitle>
          <AlertDescription>Suas respostas continuam na tela.</AlertDescription>
        </Alert>
      ) : null}
      <ExamProgress current={index + 1} total={questions.length} answered={answeredCount} />
      <QuestionNavigator
        questions={questions.map((item) => ({ id: item.id, answered: isAnswered(item, answers.answerOf(item.id)) }))}
        currentIndex={index}
        onSelect={goTo}
      />
      <article aria-labelledby={`questao-${question.id}`} className="flex flex-col gap-6">
        <QuestionHeader
          number={index + 1}
          typeLabel={QUESTION_TYPE_LABELS[question.type]}
          valueLabel={valueLabel(question.value)}
          answered={isAnswered(question, answers.answerOf(question.id))}
          headingId={`questao-${question.id}`}
          headingRef={heading}
        />
        <QuestionStatement>{question.statement}</QuestionStatement>
        {question.instructions ? <p className="m-0 text-body-sm text-text-secondary whitespace-pre-wrap">{question.instructions}</p> : null}
        <AnswerArea
          key={question.id}
          question={question}
          answer={answers.answerOf(question.id) ?? emptyAnswer(question)}
          onChange={(answer) => answers.setAnswer(question.id, answer)}
          disabled={!editable}
        />
      </article>
      <AssessmentFooter
        hasPrevious={index > 0}
        hasNext={index < questions.length - 1}
        onPrevious={() => goTo(index - 1)}
        onNext={() => goTo(index + 1)}
      />
    </section>
  );
}

function AnswerArea({
  question,
  answer,
  onChange,
  disabled,
}: {
  question: StudentQuestion;
  answer: ReturnType<typeof emptyAnswer>;
  onChange: (answer: ReturnType<typeof emptyAnswer>) => void;
  disabled: boolean;
}) {
  if (answer.kind === "ALTERNATIVE") {
    return (
      <MultipleChoiceAnswer
        name={`resposta-${question.id}`}
        alternatives={question.alternatives}
        value={answer.alternativeId}
        onChange={(alternativeId) => onChange({ kind: "ALTERNATIVE", alternativeId })}
        disabled={disabled}
      />
    );
  }
  if (answer.kind === "CODE") {
    return (
      <CodeAnswer
        id={`resposta-${question.id}`}
        language={question.language?.name ?? null}
        value={answer.source}
        onChange={(source) => onChange({ kind: "CODE", source })}
        publicTestCases={question.publicTestCases}
        disabled={disabled}
      />
    );
  }
  return (
    <EssayAnswer
      id={`resposta-${question.id}`}
      value={answer.text}
      onChange={(text) => onChange({ kind: "TEXT", text })}
      maxLength={ESSAY_MAX_LENGTH}
      disabled={disabled}
    />
  );
}

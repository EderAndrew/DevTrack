"use client";

import type { DeclareExit, StudentActivity, StudentQuestion } from "@repo/contracts";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CodeAnswer, EssayAnswer, MultipleChoiceAnswer } from "@/components/ui/assessment/answers";
import { AssessmentFooter } from "@/components/ui/assessment/assessment-footer";
import { QuestionHeader, QuestionStatement } from "@/components/ui/assessment/question";
import { ExamProgress, QuestionNavigator } from "@/components/ui/assessment/question-navigator";
import { SaveStatus } from "@/components/ui/assessment/save-status";
import { Button } from "@/components/ui/button";
import { Status } from "@/components/ui/status";
import { formatLongDateTime } from "@/lib/messages/dates";
import { apiErrorCode, ERROR_MESSAGES, messageForError } from "@/lib/messages/error-messages";
import { ExitRoomDialog } from "@/features/attendance/components/exit-room-dialog";
import { PausedNotice } from "@/features/attendance/components/paused-notice";
import { useDeclareExit, useMyPause } from "@/features/attendance/hooks/use-my-pause";
import { EXIT_ROOM } from "@/features/attendance/schemas/attendance";
import { ControlledStart } from "@/features/controlled-attempt/components/controlled-start";
import { QuestionHelp } from "@/features/work-help/components/question-help";
import { useAttemptAnswers } from "../hooks/use-attempt-answers";
import { useDeadlineWarning } from "../hooks/use-deadline-warning";
import { useCompleteAttempt, useStartAttempt, useStudentActivity, useSubmitAttempt } from "../hooks/use-student-activities";
import {
  ACTIVITY_TYPE_LABELS,
  emptyAnswer,
  ESSAY_MAX_LENGTH,
  formatGrade,
  formatPoints,
  isAnswered,
  MY_ACTIVITIES_PATH,
  QUESTION_TYPE_LABELS,
  STATUS_VARIANTS,
  statusLabel,
  valueLabel,
} from "../schemas/student-activity";
import { clearPendingAnswers } from "../store/pending-answers";
import { ActivityResult } from "./activity-result";
import { ExerciseResult, RETRY_NOTICE } from "./exercise-result";
import { Loading, LoadFailed } from "./load-states";
import { OwnRoomExits, ScreenExitRecords } from "./student-history";

export const OFFLINE_ALERT =
  "Você está sem conexão. Suas respostas ficam guardadas neste navegador e serão enviadas quando a conexão voltar.";
export const CONFLICT_ALERT = "Esta resposta foi alterada em outra aba. Carregamos a versão mais recente.";
/** The catalog's text for `ANSWER_CHANGED_ELSEWHERE`, kept after the screen reloads. */
export const CHANGED_ELSEWHERE = ERROR_MESSAGES.ANSWER_CHANGED_ELSEWHERE;
/** 015/FR-013c: the answer grew faster than typing and the server kept the saved one. */
export const TYPING_LIMIT_MESSAGE = ERROR_MESSAGES.TYPING_LIMIT_EXCEEDED;
export const SUBMIT_CONFIRMATION =
  "Tem certeza de que deseja entregar esta atividade? Depois de entregue, não será possível alterar as respostas.";
/** "Concluir exercícios" (013 contracts/web-ui.md): the answer key comes with the conclusion. */
export const COMPLETE_CONFIRMATION = "Você vai ver o gabarito e não poderá mais alterar estas respostas.";
/** "N exercícios em branco valem 0 ponto nesta conclusão." (013/US2-8). */
export function blankExercisesNotice(blankCount: number): string {
  if (blankCount === 0) return "Todos os exercícios estão respondidos.";
  return blankCount === 1
    ? "1 exercício em branco vale 0 ponto nesta conclusão."
    : `${blankCount} exercícios em branco valem 0 ponto nesta conclusão.`;
}
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
  return <ActivityView activity={query.data} userId={userId} reload={() => query.refetch()} />;
}

/**
 * A CONTROLLED work still open to answers (015/FR-007, F14): it is answered on the focus page, never
 * here; this page shows what the mode does and starts it.
 */
const answeredInFocus = (activity: StudentActivity) =>
  activity.executionMode === "CONTROLLED" && activity.canAnswer && activity.submission === null;

function ActivityView({ activity, userId, reload }: { activity: StudentActivity; userId: string; reload: () => Promise<unknown> }) {
  return (
    <>
      <PageHeader
        title={activity.title}
        breadcrumb={[{ label: "Minhas atividades", href: MY_ACTIVITIES_PATH }, { label: activity.title }]}
        status={<Status variant={STATUS_VARIANTS[activity.status]}>{statusLabel(activity)}</Status>}
      />
      <div className="flex flex-col gap-8">
        <ActivityDetails activity={activity} />
        {activity.pause ? (
          // 016: paused, here or on the focus page, the attempt shows only the notice (FR-013).
          <AnsweringSession activity={activity} userId={userId} reload={reload} />
        ) : answeredInFocus(activity) ? (
          <ControlledStart activity={activity} />
        ) : activity.attempt ? (
          <AnsweringSession activity={activity} userId={userId} reload={reload} />
        ) : activity.lastResult ? (
          // An Exercício with no open attempt after a conclusion: its result and "Refazer" (013/US2).
          <ExerciseResult activity={activity} />
        ) : (
          <StartAttempt activity={activity} />
        )}
        {/* A delivered CONTROLLED work shows the student's own screen exits (015/US5-2). */}
        {activity.executionMode === "CONTROLLED" && activity.submission ? <ScreenExitRecords activityId={activity.id} /> : null}
        {/* 016/US4-4: the own room exits, which the API sends only after the submission. */}
        {activity.submission ? <OwnRoomExits pauses={activity.pauses} /> : null}
      </div>
    </>
  );
}

/** What a CONTROLLED attempt adds to the answering screen (015, `features/controlled-attempt`). */
export interface ControlledAnswering {
  /** The clipboard is refused in the code editor (the page blocks the other fields). */
  blockClipboard: boolean;
  /** A message under a question's answer (the blocked paste or copy). */
  questionNotice: (questionId: string) => ReactNode;
  /** The same message in the question's "Pedir ajuda" field (015/US3-12). */
  helpNotice: (questionId: string) => ReactNode;
  /**
   * 016 "Sair da sala" (research M10): the monitor stops before anything else, the queued events are
   * sent with the answers, and fullscreen ends only after the pause; a refused exit turns it back on.
   */
  roomExit: { stopMonitor: () => void; resumeMonitor: () => void; flushEvents: () => Promise<void>; leaveFullscreen: () => void };
  /** 016: "Retomar em modo controlado" asks for fullscreen in the student's own click. */
  resume: { label: string; onResume: () => void };
}

/**
 * The attempt's answers with the recovery of 012 research P9: when another tab changed an answer the
 * submission carried, the server's answers come back on a fresh answering screen and the student
 * reviews them before submitting again. Shared by this page and the controlled mode's focus page.
 * Since 016 a paused attempt shows only the paused notice; a pause opened on another device or by
 * the teacher arrives with the next poll of the own pause (research M8) and reads the activity again.
 */
export function AnsweringSession({
  activity,
  userId,
  reload,
  controlled,
}: {
  activity: StudentActivity;
  userId: string;
  reload: () => Promise<unknown>;
  controlled?: ControlledAnswering;
}) {
  const [generation, setGeneration] = useState(0);
  const [changedElsewhere, setChangedElsewhere] = useState(false);
  const watching = activity.type === "ASSIGNMENT" && activity.canAnswer && activity.submission === null && activity.pause === null;
  const watch = useMyPause(activity.id, watching, "watch");
  /** The pause already acted on: a read from before the resume never reloads again. */
  const handled = useRef<string | null>(null);
  const openPause = watching ? (watch.data?.pause ?? null) : null;
  useEffect(() => {
    if (!openPause || handled.current === openPause.id) return;
    handled.current = openPause.id;
    void reload();
  }, [openPause, reload]);

  const onChangedElsewhere = async () => {
    clearPendingAnswers(userId, activity.id);
    await reload();
    setChangedElsewhere(true);
    setGeneration((current) => current + 1);
  };
  if (activity.pause) {
    const pause = activity.pause;
    return (
      <PausedNotice
        activityId={activity.id}
        pause={pause}
        deadline={activity.deadline}
        resumeLabel={controlled?.resume.label}
        onResume={() => {
          handled.current = pause.id;
          controlled?.resume.onResume();
          void reload();
        }}
      />
    );
  }
  return (
    <>
      {changedElsewhere && activity.submission === null ? (
        <Alert variant="warning">
          <AlertTitle>{CHANGED_ELSEWHERE}</AlertTitle>
        </Alert>
      ) : null}
      <AttemptAnswering
        key={`${generation}:${revisionsKey(activity)}`}
        activity={activity}
        userId={userId}
        controlled={controlled}
        onChangedElsewhere={() => void onChangedElsewhere()}
        onPaused={(pauseId) => {
          if (pauseId) handled.current = pauseId;
          void reload();
        }}
      />
    </>
  );
}

/** The server's answers and revisions: new ones (after a reload) start a fresh answering screen. */
const revisionsKey = (activity: StudentActivity) =>
  (activity.attempt?.answers ?? []).map((answer) => `${answer.questionId}:${answer.revision}`).sort().join(",");

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
        {activity.deadline ? (
          <>
            <dt className="text-text-secondary">Prazo</dt>
            <dd className="m-0">{formatLongDateTime(activity.deadline)}</dd>
          </>
        ) : null}
        {activity.totalGrade ? (
          <>
            <dt className="text-text-secondary">Nota total</dt>
            <dd className="m-0">{formatGrade(activity.totalGrade)}</dd>
          </>
        ) : null}
        {activity.points ? (
          <>
            <dt className="text-text-secondary">Pontos</dt>
            <dd className="m-0">Vale até {formatPoints(activity.points.possible)}</dd>
            {activity.completedAttempts.length > 0 ? (
              <>
                <dt className="text-text-secondary">Seus pontos</dt>
                <dd className="m-0">
                  {formatPoints(activity.points.earned)}
                  {activity.points.awaitingCorrection ? " · Pontos aguardando correção" : ""}
                </dd>
              </>
            ) : null}
          </>
        ) : null}
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

function AttemptAnswering({
  activity,
  userId,
  controlled,
  onChangedElsewhere,
  onPaused,
}: {
  activity: StudentActivity;
  userId: string;
  controlled?: ControlledAnswering;
  onChangedElsewhere: () => void;
  /** The attempt is paused now (the own exit, with its id, or a refused write): read the activity again. */
  onPaused: (pauseId?: string) => void;
}) {
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
  // An Exercício is concluded, never submitted: no deadline, no grade, the answer key after (013/US2).
  const isExercise = activity.type === "EXERCISE";
  const submitAttempt = useSubmitAttempt(activity.id);
  const completeAttempt = useCompleteAttempt(activity.id);
  const submit = isExercise ? completeAttempt : submitAttempt;
  const [confirming, setConfirming] = useState(false);
  const blankCount = questions.length - answeredCount;
  const submitRefused = submit.isError && apiErrorCode(submit.error) !== "ANSWER_CHANGED_ELSEWHERE";
  // 016: only a work's attempt has a room to leave (an Exercício never pauses, FR-007).
  const canExitRoom = editable && !isExercise;
  const [exitingRoom, setExitingRoom] = useState(false);
  const declareExit = useDeclareExit(activity.id);
  // A save or submission refused because the attempt is paused (another device, the teacher): the
  // unsent answers stay in this browser (012 FR-019) and the notice replaces the questions.
  const pausedRefusal = apiErrorCode(answers.error) === "ATTEMPT_PAUSED" || (submit.isError && apiErrorCode(submit.error) === "ATTEMPT_PAUSED");
  const paused = useRef(onPaused);
  useEffect(() => {
    paused.current = onPaused;
  });
  useEffect(() => {
    if (pausedRefusal) paused.current();
  }, [pausedRefusal]);

  /** Research M10's order: monitor off, answers and events sent, pause, then fullscreen off. */
  const exitRoom = async (body: DeclareExit) => {
    controlled?.roomExit.stopMonitor();
    try {
      await answers.flushNow();
      await controlled?.roomExit.flushEvents();
      const pause = await declareExit.mutateAsync(body);
      controlled?.roomExit.leaveFullscreen();
      setExitingRoom(false);
      onPaused(pause.id);
    } catch (error) {
      controlled?.roomExit.resumeMonitor();
      throw error;
    }
  };

  const send = () => {
    setConfirming(false);
    const callbacks = {
      // The offline buffer of this activity is done with once the server has the answers.
      onSuccess: () => clearPendingAnswers(userId, activity.id),
      onError: (error: unknown) => {
        if (apiErrorCode(error) === "ANSWER_CHANGED_ELSEWHERE") onChangedElsewhere();
      },
    };
    const body = { answers: answers.takePending() };
    if (isExercise) completeAttempt.mutate({ number: activity.attempt!.number, body }, callbacks);
    else submitAttempt.mutate(body, callbacks);
  };

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
        <div className="flex flex-wrap items-center gap-3">
          {editable ? <SaveStatus state={refused ? "idle" : answers.saveState} onRetry={answers.retry} /> : null}
          {canExitRoom ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setExitingRoom(true)}>
              {EXIT_ROOM}
            </Button>
          ) : null}
        </div>
      </div>
      <ActivityResult activity={activity} />
      {isExercise && activity.attempt && activity.attempt.number > 1 ? (
        <Alert variant="info">
          <AlertTitle>
            Tentativa {activity.attempt.number}. {RETRY_NOTICE}
          </AlertTitle>
        </Alert>
      ) : null}
      {activity.submission ? (
        <Alert variant="success">
          <AlertTitle>
            Atividade entregue em {formatLongDateTime(activity.submission.submittedAt)}.
            {activity.submission.late ? " Entrega com atraso." : ""}
          </AlertTitle>
          <AlertDescription>Suas respostas ficam somente para leitura.</AlertDescription>
        </Alert>
      ) : null}
      {submitRefused ? (
        <Alert variant="danger">
          <AlertTitle>{messageForError(submit.error)}</AlertTitle>
          <AlertDescription>Suas respostas continuam salvas.</AlertDescription>
        </Alert>
      ) : null}
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
      <article aria-labelledby={`questao-${question.id}`} data-question-id={question.id} className="flex flex-col gap-6">
        <QuestionHeader
          number={index + 1}
          typeLabel={QUESTION_TYPE_LABELS[question.type]}
          valueLabel={valueLabel(question)}
          answered={isAnswered(question, answers.answerOf(question.id))}
          headingId={`questao-${question.id}`}
          headingRef={heading}
        />
        {/* A code question puts the statement on the left and the editor on the right from `lg` up. */}
        <div
          data-slot="question-body"
          className={question.type === "CODE" ? "grid gap-6 lg:grid-cols-2 lg:items-start" : "flex flex-col gap-6"}
        >
          <div className="flex min-w-0 flex-col gap-3">
            <QuestionStatement>{question.statement}</QuestionStatement>
            {question.instructions ? <p className="m-0 text-body-sm text-text-secondary whitespace-pre-wrap">{question.instructions}</p> : null}
          </div>
          <div className="min-w-0">
            <AnswerArea
              key={question.id}
              question={question}
              answer={answers.answerOf(question.id) ?? emptyAnswer(question)}
              onChange={(answer) => answers.setAnswer(question.id, answer)}
              disabled={!editable}
              blockClipboard={Boolean(controlled?.blockClipboard) && editable}
            />
            {answers.typingRefused(question.id) ? (
              <Alert variant="warning" className="mt-3">
                <AlertTitle>{TYPING_LIMIT_MESSAGE}</AlertTitle>
              </Alert>
            ) : null}
            {controlled?.questionNotice(question.id)}
          </div>
        </div>
        {activity.aiHelp.allowance > 0 ? (
          <QuestionHelp
            key={question.id}
            activityId={activity.id}
            questionId={question.id}
            highlight={question.language?.highlight ?? undefined}
            canAsk={editable}
            notice={controlled?.helpNotice(question.id)}
          />
        ) : null}
      </article>
      <AssessmentFooter
        hasPrevious={index > 0}
        hasNext={index < questions.length - 1}
        onPrevious={() => goTo(index - 1)}
        onNext={() => goTo(index + 1)}
        submit={
          editable ? (
            <Button
              type="button"
              variant={index === questions.length - 1 ? "primary" : "outline"}
              loading={submit.isPending}
              onClick={() => setConfirming(true)}
            >
              {isExercise ? "Concluir exercícios" : "Entregar atividade"}
            </Button>
          ) : undefined
        }
      />
      {canExitRoom ? <ExitRoomDialog open={exitingRoom} onOpenChange={setExitingRoom} deadline={activity.deadline} onConfirm={exitRoom} /> : null}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isExercise ? "Concluir estes exercícios?" : "Entregar atividade?"}</AlertDialogTitle>
            <AlertDialogDescription>{isExercise ? COMPLETE_CONFIRMATION : SUBMIT_CONFIRMATION}</AlertDialogDescription>
          </AlertDialogHeader>
          <p className="m-0 text-body">
            {isExercise
              ? blankExercisesNotice(blankCount)
              : blankCount === 0
                ? "Todas as questões estão respondidas."
                : blankCount === 1
                  ? "1 questão em branco."
                  : `${blankCount} questões em branco.`}
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar às questões</AlertDialogCancel>
            <AlertDialogAction onClick={send}>{isExercise ? "Concluir" : "Entregar"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function AnswerArea({
  question,
  answer,
  onChange,
  disabled,
  blockClipboard,
}: {
  question: StudentQuestion;
  answer: ReturnType<typeof emptyAnswer>;
  onChange: (answer: ReturnType<typeof emptyAnswer>) => void;
  disabled: boolean;
  blockClipboard: boolean;
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
        highlight={question.language?.highlight ?? null}
        value={answer.source}
        onChange={(source) => onChange({ kind: "CODE", source })}
        publicTestCases={question.publicTestCases}
        disabled={disabled}
        blockClipboard={blockClipboard}
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

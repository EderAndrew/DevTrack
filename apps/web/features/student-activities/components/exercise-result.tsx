"use client";

import type { Answer, ExerciseResult as ExerciseResultValue, StudentActivity, StudentExerciseAttempt, StudentQuestion } from "@repo/contracts";
import { Award, BookOpen, CircleCheck, CircleX, Clock, RotateCcw, type LucideIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code/code-block";
import { formatLongDateTime } from "@/lib/messages/dates";
import { messageForError } from "@/lib/messages/error-messages";
import { useExerciseAttempt, useRetryAttempt } from "../hooks/use-student-activities";
import { formatPoints, isAnswered, QUESTION_TYPE_LABELS, RESULT_LABELS, RESULT_VARIANTS } from "../schemas/student-activity";
import { Loading, LoadFailed } from "./load-states";

const RESULT_ICONS: Record<ExerciseResultValue, LucideIcon> = {
  CORRECT: CircleCheck,
  WRONG: CircleX,
  PENDING_TEACHER: Clock,
  UNSCORED: BookOpen,
};

export const RETRY_NOTICE = "Refazer não vale pontos.";

/**
 * The result of a concluded Exercício attempt (013 contracts/web-ui.md, "/minhas-atividades/[id]",
 * FR-012): per exercise the result by text and icon (never color alone), "Já pontuado em outra
 * atividade", the student's answer, the answer key, the explanation and the teacher's comment; the
 * points of the first conclusion ("Você ganhou 45 pontos") or "Refazer não vale pontos"; "Refazer";
 * and the earlier conclusions, each readable again. Everything comes from the API, built there by an
 * allowlist; texts render as text.
 */
export function ExerciseResult({ activity }: { activity: StudentActivity }) {
  const latest = activity.lastResult!;
  const [selected, setSelected] = useState(latest.number);
  const earlier = useExerciseAttempt(activity.id, selected === latest.number ? null : selected);
  const retry = useRetryAttempt(activity.id);
  const canRetry = activity.canAnswer && activity.attempt === null;

  return (
    <section aria-labelledby="resultado-exercicios" className="flex flex-col gap-6">
      {selected === latest.number ? (
        <AttemptResult activity={activity} attempt={latest} />
      ) : earlier.isPending ? (
        <Loading label="Carregando a tentativa…" />
      ) : earlier.isError ? (
        <LoadFailed error={earlier.error} onRetry={() => void earlier.refetch()} />
      ) : (
        <AttemptResult activity={activity} attempt={earlier.data} />
      )}

      {canRetry ? (
        <div className="flex flex-col items-start gap-2">
          <Button type="button" loading={retry.isPending} onClick={() => retry.mutate(latest.number)}>
            <RotateCcw aria-hidden="true" />
            Refazer
          </Button>
          <p className="m-0 text-body-sm text-text-secondary">Uma nova tentativa em branco. {RETRY_NOTICE}</p>
          {retry.isError ? (
            <Alert variant="danger">
              <AlertTitle>{messageForError(retry.error)}</AlertTitle>
            </Alert>
          ) : null}
        </div>
      ) : null}

      {activity.completedAttempts.length > 1 ? (
        <nav aria-labelledby="conclusoes-titulo" className="flex flex-col gap-2">
          <h2 id="conclusoes-titulo" className="m-0 text-h3">
            Tentativas concluídas
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {activity.completedAttempts.map((attempt) => (
              <li key={attempt.number}>
                <Button
                  type="button"
                  variant={attempt.number === selected ? "secondary" : "ghost"}
                  aria-pressed={attempt.number === selected}
                  onClick={() => setSelected(attempt.number)}
                >
                  Tentativa {attempt.number} — {formatLongDateTime(attempt.completedAt)}
                </Button>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </section>
  );
}

function AttemptResult({ activity, attempt }: { activity: StudentActivity; attempt: StudentExerciseAttempt }) {
  const questions = new Map(activity.questions.map((question) => [question.id, question]));
  const pending = attempt.questions.some((item) => item.result === "PENDING_TEACHER");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="resultado-exercicios" className="m-0 text-h3">
          Resultado da tentativa {attempt.number}
        </h2>
        <p className="m-0 text-body-sm text-text-secondary">Concluída em {formatLongDateTime(attempt.completedAt)}.</p>
      </div>
      <Alert variant={attempt.first ? "success" : "info"}>
        <AlertTitle>
          {attempt.first
            ? `Você ganhou ${formatPoints(attempt.pointsEarned)}.`
            : `${RETRY_NOTICE} Seus pontos nesta atividade: ${formatPoints(activity.points?.earned ?? 0)}.`}
        </AlertTitle>
        {attempt.first && pending ? (
          <AlertDescription>Pontos aguardando correção: o professor ainda vai marcar algumas respostas.</AlertDescription>
        ) : null}
      </Alert>
      <ol aria-label="Resultado por exercício" className="m-0 flex list-none flex-col gap-4 p-0">
        {attempt.questions.map((item) => {
          const question = questions.get(item.questionId);
          if (!question) return null;
          const Icon = RESULT_ICONS[item.result];
          const headingId = `resultado-${attempt.number}-${item.questionId}`;
          return (
            <li key={item.questionId}>
              <article aria-labelledby={headingId} className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id={headingId} className="m-0 text-h3">
                    Exercício {item.position + 1}
                  </h3>
                  <span className="text-body-sm text-text-secondary">{QUESTION_TYPE_LABELS[question.type]}</span>
                  <Badge variant={RESULT_VARIANTS[item.result]}>
                    <Icon aria-hidden="true" />
                    {RESULT_LABELS[item.result]}
                  </Badge>
                  {item.alreadyScored ? (
                    <Badge variant="neutral">
                      <Award aria-hidden="true" />
                      Já pontuado em outra atividade
                    </Badge>
                  ) : null}
                  {attempt.first && !item.alreadyScored ? <span className="text-body-sm">{formatPoints(item.points)}</span> : null}
                </div>
                <p className="m-0 text-reading whitespace-pre-wrap">{question.statement}</p>
                <dl className="m-0 flex flex-col gap-3">
                  <Entry term="Sua resposta">
                    <AnswerText question={question} answer={item.answer} label="Sua resposta" />
                  </Entry>
                  <Entry term="Gabarito">
                    {question.type === "MULTIPLE_CHOICE" ? (
                      <p className="m-0">
                        Alternativa correta:{" "}
                        {question.alternatives.find((alternative) => alternative.id === item.correctAlternativeId)?.text ?? "—"}
                      </p>
                    ) : question.type === "CODE" ? (
                      <CodeBlock label="Solução de referência" code={item.expectedSolution ?? ""} highlight={question.language?.highlight} />
                    ) : (
                      <p className="m-0 whitespace-pre-wrap">{item.expectedAnswer ?? "—"}</p>
                    )}
                  </Entry>
                  {item.explanation ? (
                    <Entry term="Explicação">
                      <p className="m-0 whitespace-pre-wrap">{item.explanation}</p>
                    </Entry>
                  ) : null}
                  {item.teacherComment ? (
                    <Entry term="Comentário do professor">
                      <p className="m-0 whitespace-pre-wrap">{item.teacherComment}</p>
                    </Entry>
                  ) : null}
                </dl>
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The student's own answer as text; a blank one says so. */
function AnswerText({ question, answer, label }: { question: StudentQuestion; answer: Answer | null; label: string }) {
  if (answer === null || !isAnswered(question, answer)) return <p className="m-0 text-text-secondary">Em branco</p>;
  if (answer.kind === "ALTERNATIVE") {
    return <p className="m-0">{question.alternatives.find((alternative) => alternative.id === answer.alternativeId)?.text ?? "—"}</p>;
  }
  if (answer.kind === "CODE") return <CodeBlock label={label} code={answer.source} highlight={question.language?.highlight} />;
  return <p className="m-0 whitespace-pre-wrap">{answer.text}</p>;
}

function Entry({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-label text-text-secondary">{term}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}

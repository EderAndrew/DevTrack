"use client";

import { useState } from "react";
import { CodeAnswer, EssayAnswer, MultipleChoiceAnswer } from "@/components/ui/assessment/answers";
import { AssessmentFooter } from "@/components/ui/assessment/assessment-footer";
import { QuestionHeader, QuestionStatement, QuestionStatus } from "@/components/ui/assessment/question";
import { ExamProgress, QuestionNavigator } from "@/components/ui/assessment/question-navigator";
import { AttemptStatus, SaveStatus } from "@/components/ui/assessment/save-status";
import { ExamAlert, LEAVE_ATTEMPT } from "@/components/ui/assessment/exam-alert";
import { ExamTimer } from "@/components/ui/assessment/exam-timer";
import { FinalCountdown } from "@/components/ui/assessment/final-countdown";
import { FocusViolationWarning } from "@/components/ui/assessment/focus-violation-warning";
import { TimeAlert } from "@/components/ui/assessment/time-alert";
import { Button } from "@/components/ui/button";
import { Sample, Showcase } from "./sample";

// 012 research P21: the Exam Mode components built for the student's answering screen (NORMAL mode).

const QUESTIONS = [
  { id: "q1", answered: true },
  { id: "q2", answered: false },
  { id: "q3", answered: true },
  { id: "q4", answered: false },
];

export function ExamProgressShowcase() {
  return (
    <Showcase id="exam-progress">
      <Sample name="início" className="block">
        <ExamProgress current={1} total={4} answered={0} />
      </Sample>
      <Sample name="parcial" className="block">
        <ExamProgress current={3} total={4} answered={2} />
      </Sample>
    </Showcase>
  );
}

export function QuestionNavigatorShowcase() {
  const [current, setCurrent] = useState(1);
  return (
    <Showcase id="question-navigator">
      <Sample name="atual, respondida e não respondida" className="block">
        <QuestionNavigator questions={QUESTIONS} currentIndex={current} onSelect={setCurrent} />
      </Sample>
    </Showcase>
  );
}

export function QuestionHeaderShowcase() {
  return (
    <Showcase id="question-header">
      <Sample name="com estado" className="block">
        <QuestionHeader number={2} typeLabel="Múltipla escolha" valueLabel="Vale 0,25" answered={false} />
      </Sample>
      <Sample name="sem estado" className="block">
        <QuestionHeader number={3} typeLabel="Código" valueLabel="Vale 0,50" />
      </Sample>
    </Showcase>
  );
}

export function QuestionStatusShowcase() {
  return (
    <Showcase id="question-status">
      <Sample name="não respondida">
        <QuestionStatus answered={false} />
      </Sample>
      <Sample name="respondida">
        <QuestionStatus answered />
      </Sample>
    </Showcase>
  );
}

export function QuestionStatementShowcase() {
  return (
    <Showcase id="question-statement">
      <Sample name="texto com quebras de linha" className="block">
        <QuestionStatement>
          {"Explique a diferença entre classe e objeto.\nDê um exemplo do seu dia a dia."}
        </QuestionStatement>
      </Sample>
    </Showcase>
  );
}

const ALTERNATIVES = [
  { id: "a", text: "Uma instância de uma classe." },
  { id: "b", text: "Um tipo primitivo." },
  { id: "c", text: "Um pacote de classes." },
];

export function MultipleChoiceAnswerShowcase() {
  const [value, setValue] = useState<string | null>("a");
  return (
    <Showcase id="multiple-choice-answer">
      <Sample name="escolhida" className="block">
        <MultipleChoiceAnswer name="vitrine-escolha" alternatives={ALTERNATIVES} value={value} onChange={setValue} />
      </Sample>
      <Sample name="desabilitada" className="block">
        <MultipleChoiceAnswer
          name="vitrine-escolha-desabilitada"
          legend="Alternativas (somente leitura)"
          alternatives={ALTERNATIVES}
          value="b"
          onChange={() => undefined}
          disabled
        />
      </Sample>
    </Showcase>
  );
}

export function EssayAnswerShowcase() {
  const [value, setValue] = useState("Classe é o molde; objeto é o que se cria a partir dele.");
  return (
    <Showcase id="essay-answer">
      <Sample name="com contador" className="block">
        <EssayAnswer id="vitrine-dissertativa" value={value} onChange={setValue} maxLength={20_000} />
      </Sample>
    </Showcase>
  );
}

export function CodeAnswerShowcase() {
  const [value, setValue] = useState("class Main {\n  public static void main(String[] args) {\n  }\n}");
  return (
    <Showcase id="code-answer">
      <Sample name="com casos públicos" className="block">
        <CodeAnswer
          id="vitrine-codigo"
          language="Java"
          highlight="java"
          value={value}
          onChange={setValue}
          publicTestCases={[{ input: "2 3", expectedOutput: "5" }]}
        />
      </Sample>
    </Showcase>
  );
}

export function SaveStatusShowcase() {
  return (
    <Showcase id="save-status">
      <Sample name="salvo">
        <SaveStatus state="saved" />
      </Sample>
      <Sample name="erro ao salvar" className="block">
        <SaveStatus state="error" onRetry={() => undefined} />
      </Sample>
    </Showcase>
  );
}

export const ATTEMPT_STATES = ["IN_PROGRESS", "SUBMITTED", "SUBMITTED_LATE", "CLOSED"] as const;

export function AttemptStatusShowcase() {
  return (
    <Showcase id="attempt-status">
      {ATTEMPT_STATES.map((state) => (
        <Sample key={state} name={state}>
          <AttemptStatus state={state} />
        </Sample>
      ))}
    </Showcase>
  );
}

export function AssessmentFooterShowcase() {
  return (
    <Showcase id="assessment-footer">
      <Sample name="primeira questão" className="block">
        <AssessmentFooter hasPrevious={false} hasNext onPrevious={() => undefined} onNext={() => undefined} />
      </Sample>
      <Sample name="no meio" className="block">
        <AssessmentFooter hasPrevious hasNext onPrevious={() => undefined} onNext={() => undefined} />
      </Sample>
    </Showcase>
  );
}

// 015 research F15: the warnings of the controlled mode (design-system/exam-mode.md).

export function FocusViolationWarningShowcase() {
  return (
    <Showcase id="focus-violation-warning">
      <Sample name="registrado" className="block">
        <FocusViolationWarning recordedAt="2026-10-01T17:32:00.000Z" onDismiss={() => undefined} />
      </Sample>
      <Sample name="registrando" className="block">
        <FocusViolationWarning recordedAt={null} />
      </Sample>
      <Sample name="saiu da tela cheia" className="block">
        <FocusViolationWarning recordedAt="2026-10-01T17:32:00.000Z" onReturnToFullscreen={() => undefined} />
      </Sample>
    </Showcase>
  );
}

export function ExamAlertShowcase() {
  const [open, setOpen] = useState(false);
  return (
    <Showcase id="exam-alert">
      <Sample name="sair da avaliação">
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          Sair
        </Button>
        <ExamAlert open={open} onOpenChange={setOpen} text={LEAVE_ATTEMPT} confirmLabel="Sair da avaliação" onConfirm={() => undefined} />
      </Sample>
    </Showcase>
  );
}

// 018 research T18: the exam's time (design-system/exam-mode.md, "ExamTimer", "TimeAlert", "FinalCountdown").

/** A fixed time left, so the catalog shows each state without waiting for it. */
const left = (ms: number) => () => ms;

export function ExamTimerShowcase() {
  return (
    <Showcase id="exam-timer">
      <Sample name="normal">
        <ExamTimer remaining={left(42 * 60_000 + 7_000)} />
      </Sample>
      <Sample name="faltando 5 minutos">
        <ExamTimer remaining={left(4 * 60_000 + 30_000)} />
      </Sample>
      <Sample name="último minuto">
        <ExamTimer remaining={left(48_000)} />
      </Sample>
    </Showcase>
  );
}

/** Starts above the mark and crosses it a moment later, as an exam does. */
function crossing(fromMs: number, toMs: number) {
  const start = Date.now();
  return () => (Date.now() - start < 300 ? fromMs : toMs);
}

export function TimeAlertShowcase() {
  const [ten] = useState(() => crossing(10 * 60_000 + 1_000, 10 * 60_000));
  const [five] = useState(() => crossing(5 * 60_000 + 1_000, 5 * 60_000));
  return (
    <Showcase id="time-alert">
      <Sample name="faltam 10 minutos" className="block">
        <TimeAlert remaining={ten} />
      </Sample>
      <Sample name="faltam 5 minutos" className="block">
        <TimeAlert remaining={five} />
      </Sample>
    </Showcase>
  );
}

export function FinalCountdownShowcase() {
  const [shown, setShown] = useState(false);
  const [remaining, setRemaining] = useState(() => left(11_000));
  return (
    <Showcase id="final-countdown">
      <Sample name="últimos 10 segundos">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const end = Date.now() + 10_900;
            setRemaining(() => () => end - Date.now());
            setShown(true);
          }}
        >
          Mostrar a contagem
        </Button>
        {shown ? <FinalCountdown key={String(remaining)} remaining={remaining} /> : null}
      </Sample>
    </Showcase>
  );
}

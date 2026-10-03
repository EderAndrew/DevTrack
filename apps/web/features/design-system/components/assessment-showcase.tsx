"use client";

import { useState } from "react";
import { CodeAnswer, EssayAnswer, MultipleChoiceAnswer } from "@/components/ui/assessment/answers";
import { AssessmentFooter } from "@/components/ui/assessment/assessment-footer";
import { CodeEditor } from "@/components/ui/assessment/code-editor";
import { QuestionHeader, QuestionStatement, QuestionStatus } from "@/components/ui/assessment/question";
import { ExamProgress, QuestionNavigator } from "@/components/ui/assessment/question-navigator";
import { AttemptStatus, SaveStatus } from "@/components/ui/assessment/save-status";
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
          value={value}
          onChange={setValue}
          publicTestCases={[{ input: "2 3", expectedOutput: "5" }]}
        />
      </Sample>
    </Showcase>
  );
}

export function CodeEditorShowcase() {
  const [value, setValue] = useState("def soma(a, b):\n  return a + b");
  return (
    <Showcase id="code-editor">
      <Sample name="editável" className="block">
        <CodeEditor id="vitrine-editor" aria-label="Editor de código" value={value} onChange={setValue} />
      </Sample>
      <Sample name="desabilitado" className="block">
        <CodeEditor
          id="vitrine-editor-desabilitado"
          aria-label="Editor de código desabilitado"
          value="print('somente leitura')"
          onChange={() => undefined}
          disabled
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

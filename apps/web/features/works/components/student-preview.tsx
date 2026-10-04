"use client";

import type { WorkQuestionStudentView, WorkStudentView } from "@repo/contracts";
import type { ReactNode } from "react";
import { CodeBlock } from "@/components/ui/code/code-block";
import { messageForError } from "@/lib/messages/error-messages";
import { useWorkStudentPreview } from "../hooks/use-works";
import { formatGrade, WORK_QUESTION_TYPE_LABELS } from "../schemas/work-form";

/**
 * "Ver como aluno" (011/US6, contracts/web-ui.md): the work exactly as the server's student view
 * has it, read-only. It shows what the response carries and nothing else; the answer key never
 * reaches the browser here, since the server builds this view from an allowlist (FR-033).
 */
export function StudentPreview({ workId }: { workId: string }) {
  const query = useWorkStudentPreview(workId);
  if (query.isError) return <p role="alert">{messageForError(query.error)}</p>;
  if (!query.data) return <p role="status">Carregando a visão do aluno…</p>;
  return <StudentPreviewContent work={query.data} />;
}

export function StudentPreviewContent({ work }: { work: WorkStudentView }) {
  return (
    <section
      aria-labelledby="visao-aluno-titulo"
      className="flex flex-col gap-4"
    >
      <header className="flex flex-col gap-1">
        <p className="text-label text-text-secondary">
          Visão do aluno (somente leitura)
        </p>
        <h2 id="visao-aluno-titulo" className="text-h2">
          {work.title}
        </h2>
        {work.description !== null ? (
          <p className="m-0 whitespace-pre-wrap">{work.description}</p>
        ) : null}
        <p className="m-0">Nota total: {formatGrade(work.totalGrade)}</p>
      </header>
      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        {work.questions.map((question, index) => (
          <li key={question.id}>
            <StudentQuestion question={question} number={index + 1} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function StudentQuestion({
  question,
  number,
}: {
  question: WorkQuestionStudentView;
  number: number;
}) {
  const titleId = `visao-aluno-questao-${number}`;
  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-2 rounded-md border border-border p-3"
    >
      <h3 id={titleId} className="text-h3">
        Questão {number}
      </h3>
      <p className="m-0 text-text-secondary">
        {WORK_QUESTION_TYPE_LABELS[question.type]} · Vale{" "}
        {formatGrade(question.value)}
      </p>
      <dl className="m-0 flex flex-col gap-2">
        <Item term="Enunciado">{question.statement}</Item>
        {question.alternatives ? (
          <Item term="Alternativas">
            <ol className="m-0 pl-6">
              {question.alternatives.map((alternative) => (
                <li key={alternative.id}>{alternative.text}</li>
              ))}
            </ol>
          </Item>
        ) : null}
        {question.instructions !== undefined ? (
          <Item term="Instruções">{question.instructions}</Item>
        ) : null}
        {question.language ? (
          <Item term="Linguagem">{question.language.name}</Item>
        ) : null}
        {question.starterCode !== undefined ? (
          <Item term="Código inicial">
            <CodeBlock
              label="Código inicial"
              code={question.starterCode}
              highlight={question.language?.highlight}
            />
          </Item>
        ) : null}
        {question.publicTestCases && question.publicTestCases.length > 0 ? (
          <Item term="Casos de teste">
            <ul className="m-0 pl-6">
              {question.publicTestCases.map((testCase, index) => (
                <li key={index}>
                  Entrada: {testCase.input === "" ? "(vazia)" : testCase.input}{" "}
                  · Saída esperada:{" "}
                  {testCase.expectedOutput === ""
                    ? "(vazia)"
                    : testCase.expectedOutput}
                </li>
              ))}
            </ul>
          </Item>
        ) : null}
      </dl>
    </article>
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

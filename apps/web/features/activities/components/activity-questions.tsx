import type { TeacherQuestion } from "@repo/contracts";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatGrade, formatPoints, QUESTION_TYPE_LABELS } from "../schemas/activity-form";

/**
 * The activity's snapshot as the teacher reads it (contracts/web-ui.md, detail page): every
 * question with its value and answer key, read-only. Never reaches a student page.
 */
export function ActivityQuestions({ questions }: { questions: TeacherQuestion[] }) {
  return (
    <section aria-labelledby="questoes-titulo" className="flex flex-col gap-4">
      <h3 id="questoes-titulo" className="m-0 text-h3">
        Questões e gabarito
      </h3>
      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        {questions.map((question) => (
          <li key={question.id} className="rounded-md border border-border p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h4 className="m-0 text-h3">Questão {question.position + 1}</h4>
              <span>{QUESTION_TYPE_LABELS[question.type]}</span>
              <span>Vale {question.value !== null ? formatGrade(question.value) : formatPoints(question.points ?? 0)}</span>
              {question.isTrickQuestion ? (
                <Badge variant="warning">
                  <AlertTriangle aria-hidden="true" />
                  Pegadinha
                </Badge>
              ) : null}
            </div>
            <dl className="m-0 flex flex-col gap-2">
              <Item term="Enunciado">{question.statement}</Item>
              {question.type === "MULTIPLE_CHOICE" ? (
                <Item term="Alternativas">
                  <ol className="m-0 pl-6">
                    {question.alternatives.map((alternative) => (
                      <li key={alternative.id}>
                        {alternative.text}
                        {alternative.isCorrect ? <strong> (correta)</strong> : null}
                      </li>
                    ))}
                  </ol>
                </Item>
              ) : null}
              {question.expectedAnswer !== null ? <Item term="Resposta esperada">{question.expectedAnswer}</Item> : null}
              {question.rubric !== null ? <Item term="Rubrica">{question.rubric}</Item> : null}
              {question.instructions !== null ? <Item term="Instruções">{question.instructions}</Item> : null}
              {question.language ? <Item term="Linguagem">{question.language.name}</Item> : null}
              {question.starterCode !== null ? <Item term="Código inicial">{question.starterCode}</Item> : null}
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
              {question.topics.length > 0 ? (
                <Item term="Tópicos">{question.topics.map((topic) => topic.title).join("; ")}</Item>
              ) : null}
            </dl>
          </li>
        ))}
      </ol>
    </section>
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

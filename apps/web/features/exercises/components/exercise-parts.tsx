import type { ExerciseStatus, ExerciseTeacherView } from "@repo/contracts";
import { AlertTriangle, Pencil, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code/code-block";
import { Status, type StatusVariant } from "@/components/ui/status";
import { COGNITIVE_OBJECTIVE_LABELS, DIFFICULTY_LABELS } from "../schemas/exercise-form";
import { TestCaseList } from "./exercise-test-cases";

/** The pieces the bank, the exercise page and the batch review show of an exercise (010 contracts/web-ui.md). */

export const EXERCISE_STATUS_LABELS: Record<ExerciseStatus, string> = { DRAFT: "Rascunho", APPROVED: "Aprovado", ARCHIVED: "Arquivado" };
const EXERCISE_STATUS_VARIANTS: Record<ExerciseStatus, StatusVariant> = { DRAFT: "warning", APPROVED: "success", ARCHIVED: "neutral" };

/** The exercise's status in words (never color alone). */
export function ExerciseStatusLabel({ status }: { status: ExerciseStatus }) {
  return <Status variant={EXERCISE_STATUS_VARIANTS[status]}>{EXERCISE_STATUS_LABELS[status]}</Status>;
}

/** "Gerado por IA", "Editado por você" and "Pegadinha": words and an icon, never color alone. */
export function ExerciseBadges({ exercise }: { exercise: ExerciseTeacherView }) {
  return (
    <div className="flex flex-wrap gap-2">
      {exercise.origin === "AI_GENERATED" ? (
        <Badge variant="info">
          <Sparkles aria-hidden="true" />
          Gerado por IA
        </Badge>
      ) : null}
      {exercise.humanEdited ? (
        <Badge variant="neutral">
          <Pencil aria-hidden="true" />
          Editado por você
        </Badge>
      ) : null}
      {exercise.isTrickQuestion ? (
        <Badge variant="warning">
          <AlertTriangle aria-hidden="true" />
          Pegadinha
        </Badge>
      ) : null}
    </div>
  );
}

/** What the teacher reads of an exercise: everything, answers included (never shown to students). */
export function ExerciseContent({ exercise }: { exercise: ExerciseTeacherView }) {
  return (
    <dl className="m-0 flex flex-col gap-2">
      <Item term="Enunciado">{exercise.statement}</Item>
      <Item term="Dificuldade e objetivo">
        {DIFFICULTY_LABELS[exercise.difficulty]} · {COGNITIVE_OBJECTIVE_LABELS[exercise.cognitiveObjective]}
      </Item>
      {exercise.expectedAnswer !== null ? <Item term="Resposta esperada">{exercise.expectedAnswer}</Item> : null}
      {exercise.type === "MULTIPLE_CHOICE" ? (
        <Item term="Alternativas">
          <ol className="m-0 pl-6">
            {exercise.alternatives.map((alternative) => (
              <li key={alternative.id}>
                {alternative.text}
                {alternative.isCorrect ? <strong> (correta)</strong> : null}
              </li>
            ))}
          </ol>
        </Item>
      ) : null}
      {exercise.instructions !== null ? <Item term="Instruções">{exercise.instructions}</Item> : null}
      {exercise.starterCode !== null ? (
        <Item term="Código inicial">
          <CodeBlock label="Código inicial" code={exercise.starterCode} highlight={exercise.language?.highlight} />
        </Item>
      ) : null}
      {exercise.expectedSolution !== null ? (
        <Item term="Solução esperada">
          <CodeBlock label="Solução esperada" code={exercise.expectedSolution} highlight={exercise.language?.highlight} />
        </Item>
      ) : null}
      {exercise.language ? <Item term="Linguagem">{exercise.language.name}</Item> : null}
      {exercise.type === "CODE" ? (
        <Item term="Casos de teste">
          <TestCaseList cases={exercise.testCases} />
        </Item>
      ) : null}
      <Item term="Explicação">{exercise.explanation}</Item>
    </dl>
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

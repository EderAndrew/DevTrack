import type { StudentActivity } from "@repo/contracts";
import { formatGrade } from "../schemas/student-activity";

/**
 * The released result (012 US6, FR-029): the total grade ("0,95 de 1,00"), the general feedback and
 * each question's grade and feedback, as text. The API sends it only once released with complete
 * grading; there is never an answer key here.
 */
export function ActivityResult({ activity }: { activity: StudentActivity }) {
  const result = activity.result;
  if (!result) return null;
  const questions = new Map(activity.questions.map((question) => [question.id, question]));
  return (
    <section aria-labelledby="resultado-titulo" className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
      <h3 id="resultado-titulo" className="m-0 text-h3">
        Resultado
      </h3>
      <dl className="m-0 flex flex-col gap-2">
        <div>
          <dt className="text-label text-text-secondary">Nota</dt>
          <dd className="m-0">
            {formatGrade(result.grade)} de {formatGrade(activity.totalGrade ?? "0.00")}
          </dd>
        </div>
        {result.generalFeedback ? (
          <div>
            <dt className="text-label text-text-secondary">Feedback geral</dt>
            <dd className="m-0 whitespace-pre-wrap">{result.generalFeedback}</dd>
          </div>
        ) : null}
      </dl>
      <ol aria-label="Nota por questão" className="m-0 flex list-none flex-col gap-2 p-0">
        {result.questions.map((item) => {
          const question = questions.get(item.questionId);
          if (!question) return null;
          return (
            <li key={item.questionId} className="flex flex-col gap-1">
              <span>
                Questão {question.position + 1}: {formatGrade(item.grade)} de {formatGrade(question.value ?? "0.00")}
              </span>
              {item.feedback ? <span className="whitespace-pre-wrap text-text-secondary">Feedback: {item.feedback}</span> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

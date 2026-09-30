import { distributeGrade, type GradeCents } from "@repo/contracts";

/**
 * Each question's value from the work's total grade (011 research W4): `distributeGrade` over the
 * questions in position order, so the first positions carry the remainder. Rewritten on every
 * create, edit and materialization; never taken from a request or the AI.
 */
export function withValues<T>(totalCents: GradeCents, orderedQuestions: readonly T[]): (T & { valueCents: GradeCents })[] {
  const values = distributeGrade(totalCents, orderedQuestions.length);
  return orderedQuestions.map((question, index) => ({ ...question, valueCents: values[index]! }));
}

import type { GradeCents, QuestionGrading, WorkGrade } from "@repo/contracts";
import { GradingRuleError, withinValue } from "./strategy";

/**
 * The student's grade in a work (011/FR-041): the sum of the final grades. A question without one
 * adds nothing and makes the grade partial — never a 0 by default. Every final grade lies in
 * 0…its value and the sum in 0…the total, else `GRADE_OUT_OF_RANGE`.
 */
export function computeWorkGrade(gradings: readonly QuestionGrading[], totalCents: GradeCents): WorkGrade {
  let cents = 0;
  let partial = false;
  for (const grading of gradings) {
    if (grading.finalCents === null) {
      partial = true;
      continue;
    }
    if (!withinValue(grading.finalCents, grading.valueCents)) throw new GradingRuleError("GRADE_OUT_OF_RANGE");
    cents += grading.finalCents;
  }
  if (!withinValue(cents, totalCents)) throw new GradingRuleError("GRADE_OUT_OF_RANGE");
  return { cents, partial };
}

import type { GradeCents, QuestionGrading } from "@repo/contracts";
import { GradingRuleError, withinValue } from "./strategy";

/**
 * The teacher's grade (011/FR-039): 0…value in whole hundredths, else `GRADE_OUT_OF_RANGE`. It
 * becomes the final grade, `HUMAN_DECISION`, over a suggestion, a pending question or a rule's
 * result (the teacher's review prevails).
 */
export function decideByTeacher(grading: QuestionGrading, cents: GradeCents): QuestionGrading {
  if (!withinValue(cents, grading.valueCents)) throw new GradingRuleError("GRADE_OUT_OF_RANGE");
  return { ...grading, status: "DECIDED", nature: "HUMAN_DECISION", teacherCents: cents, finalCents: cents, pendingReason: null };
}

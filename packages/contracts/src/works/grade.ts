import { z } from "zod";
import { splitEvenly } from "../common/split-evenly.js";

// Grades are exact decimals (011 research W3): integer hundredths in code, `numeric(5,2)` in the
// database and a decimal string on the wire. Never `* 0.01` or `/ 100` on a float.

/** A grade in integer hundredths: 0,50 → 50. */
export type GradeCents = number;

export const GRADE_MIN_CENTS = 1;
export const GRADE_MAX_CENTS = 10_000;

/** Parses a well-formed grade string; the schemas check the format first. */
export function gradeToCents(grade: string): GradeCents {
  const [whole = "0", fraction = ""] = grade.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** Always two decimals: 50 → "0.50". */
export function centsToGrade(cents: GradeCents): string {
  return String(Math.floor(cents / 100)) + "." + String(cents % 100).padStart(2, "0");
}

/** Input: a dot and 0–2 decimals ("0.5", "0.50", "1"), 0.01–100.00; more decimals are refused, never rounded. */
export const GradeStringSchema = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,2})?$/)
  .refine((grade) => {
    const cents = gradeToCents(grade);
    return cents >= GRADE_MIN_CENTS && cents <= GRADE_MAX_CENTS;
  }, "GRADE_OUT_OF_RANGE");

/** Output: always exactly two decimals ("0.50"). */
export const GradeOutputSchema = z.string().regex(/^\d{1,3}\.\d{2}$/);

/**
 * Each question's value by position (011 research W4): `splitEvenly` over the hundredths, so the
 * first positions carry the remainder. 0,50 over 3 → 17, 17, 16. Precondition `totalCents ≥ count`,
 * enforced by the request contract (at least 0,01 per question).
 */
export function distributeGrade(totalCents: GradeCents, count: number): GradeCents[] {
  return splitEvenly(totalCents, count);
}

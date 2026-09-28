import type { ExerciseStudentView } from "@repo/contracts";
import { type ExerciseRecord, exerciseType } from "../types";

/**
 * What a student may see (010/FR-036, FR-037, research X12), built by copying the allowed fields
 * one by one — never by removing fields from the teacher view — so a new column stays hidden from
 * students until it is listed here or in its type. Served by no route in 010.
 */
export function toStudentView(record: ExerciseRecord): ExerciseStudentView {
  return {
    id: record.id,
    type: record.type,
    statement: record.statement,
    difficulty: record.difficulty,
    ...exerciseType(record.type).studentFields(record),
  };
}

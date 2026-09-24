import type { SchoolClass } from "../../generated/prisma/client";
import { AppException } from "../../platform/http/errors";

/** A class that can have a calendar and a plan: the offering of a subject, with both dates. */
export type PlannableClass = SchoolClass & { subjectId: string; startsOn: Date; endsOn: Date };

/**
 * Guards the calendar and plan routes (004 data-model: "plannable"). Without a subject or dates →
 * `422 CLASS_NOT_PLANNABLE`. Writes (`mode: "write"`) to an ARCHIVED class → `409 PLAN_ARCHIVED`,
 * checked first; reads of an archived class still show what it had.
 */
export function requirePlannable(schoolClass: SchoolClass, mode: "read" | "write" = "read"): PlannableClass {
  if (mode === "write" && schoolClass.status === "ARCHIVED") throw new AppException("PLAN_ARCHIVED");
  if (!schoolClass.subjectId || !schoolClass.startsOn || !schoolClass.endsOn) {
    throw new AppException("CLASS_NOT_PLANNABLE");
  }
  return schoolClass as PlannableClass;
}

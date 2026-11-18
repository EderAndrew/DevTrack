import type { SchoolClass } from "../../generated/prisma/client";
import { AppException } from "../../platform/http/errors";
import type { ClassInContext } from "./class-context.policy";

/** A class that can have a calendar and a plan: the offering of a subject, with both dates. */
export type PlannableClass = ClassInContext & { subjectId: string; startsOn: Date; endsOn: Date };

/**
 * Guards the calendar and plan routes (004 data-model: "plannable"). Without a subject or dates →
 * `422 CLASS_NOT_PLANNABLE`. Writes (`mode: "write"`) to an ARCHIVED class → `409 PLAN_ARCHIVED`,
 * checked first; reads of an archived class still show what it had. The services pass the class of
 * `ClassContextPolicy`, whose `status` is the effective one (027 FR-023).
 */
export function requirePlannable<T extends Pick<SchoolClass, "status" | "subjectId" | "startsOn" | "endsOn">>(
  schoolClass: T,
  mode: "read" | "write" = "read",
): T & { subjectId: string; startsOn: Date; endsOn: Date } {
  if (mode === "write" && schoolClass.status === "ARCHIVED") throw new AppException("PLAN_ARCHIVED");
  if (!schoolClass.subjectId || !schoolClass.startsOn || !schoolClass.endsOn) {
    throw new AppException("CLASS_NOT_PLANNABLE");
  }
  return schoolClass as T & { subjectId: string; startsOn: Date; endsOn: Date };
}

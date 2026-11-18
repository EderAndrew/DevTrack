import { z } from "zod";
import { IsoDateSchema, IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { ClassPlanStatusSchema } from "../curriculum/class-plan.js";

// Classes of a teacher (003 contracts/http-api.md, "Turmas"). Strict: unknown fields → 400.
// Since 004 a class is the offering of a subject, with its start and end dates.

export const ClassStatusSchema = z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]);
export type ClassStatus = z.infer<typeof ClassStatusSchema>;

/** Unique per teacher ignoring case (003/FR-002). */
export const ClassCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .regex(/^[A-Za-z0-9._-]+$/);
export type ClassCode = z.infer<typeof ClassCodeSchema>;

export const AcademicYearSchema = z.int().min(1900).max(2100);
export type AcademicYear = z.infer<typeof AcademicYearSchema>;


/**
 * 004/US1-5: `startsOn` and `endsOn` are sent together, both dates or both null, and the end is
 * not before the start. The issue points at the field to fix.
 */
export function refineClassPeriod(
  value: { startsOn?: string | null; endsOn?: string | null },
  ctx: z.RefinementCtx,
): void {
  const { startsOn, endsOn } = value;
  if ((startsOn === undefined) !== (endsOn === undefined) || (startsOn === null) !== (endsOn === null)) {
    const missing = startsOn === undefined || startsOn === null ? "startsOn" : "endsOn";
    ctx.addIssue({ code: "custom", path: [missing] });
    return;
  }
  if (startsOn && endsOn && endsOn < startsOn) ctx.addIssue({ code: "custom", path: ["endsOn"] });
}

/**
 * 027 FR-017, research Q10: the teacher adds one of their ACTIVE subjects to an ACTIVE turma, with an optional
 * calendar (004 rules). The teacher comes from the session; the turma's data belong to the cohort.
 */
export const CreateClassFieldsSchema = z.strictObject({
  cohortId: UuidSchema,
  subjectId: UuidSchema,
  startsOn: IsoDateSchema.nullable().optional(),
  endsOn: IsoDateSchema.nullable().optional(),
});
export const CreateClassRequestSchema = CreateClassFieldsSchema.superRefine(refineClassPeriod);
export type CreateClassRequest = z.infer<typeof CreateClassRequestSchema>;

/**
 * 027 FR-019: a teacher edits only the calendar of a disciplina da turma — both dates or both null (004
 * rules); the turma's fields belong to the cohort and the subject never changes (any other field → 400).
 */
export const UpdateClassRequestSchema = z
  .strictObject({ startsOn: IsoDateSchema.nullable(), endsOn: IsoDateSchema.nullable() })
  .superRefine(refineClassPeriod);
export type UpdateClassRequest = z.infer<typeof UpdateClassRequestSchema>;

export const ChangeClassStatusRequestSchema = z.strictObject({ status: ClassStatusSchema });
export type ChangeClassStatusRequest = z.infer<typeof ChangeClassStatusRequestSchema>;

/** The turma of a disciplina da turma, as the teacher sees it (027 contracts/http-api.md). */
export const ClassCohortSchema = z.strictObject({
  id: UuidSchema,
  name: z.string(),
  code: z.string(),
  academicYear: z.int(),
  period: z.string().nullable(),
});
export type ClassCohort = z.infer<typeof ClassCohortSchema>;

/**
 * A disciplina da turma (027). `name`, `code`, `academicYear`, `period`, `description` and `activeStudentCount` are
 * the turma's, kept for the 004–026 screens; `status` is the effective status (FR-023), as `effectiveStatus`;
 * `ownStatus` is the class's own; `canChangeStatus` says the calendar is over (FR-022).
 */
export const ClassViewSchema = z.strictObject({
  id: UuidSchema,
  name: z.string(),
  code: z.string(),
  academicYear: z.int(),
  period: z.string().nullable(),
  description: z.string().nullable(),
  status: ClassStatusSchema,
  activeStudentCount: z.int(),
  subject: z.strictObject({ id: UuidSchema, name: z.string() }).nullable(),
  startsOn: IsoDateSchema.nullable(),
  endsOn: IsoDateSchema.nullable(),
  /** Has a subject and both dates and is not ARCHIVED (004 data-model). */
  plannable: z.boolean(),
  /** Null while the class has no plan. */
  planStatus: ClassPlanStatusSchema.nullable(),
  cohort: ClassCohortSchema,
  ownStatus: ClassStatusSchema,
  effectiveStatus: ClassStatusSchema,
  canChangeStatus: z.boolean(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ClassView = z.infer<typeof ClassViewSchema>;

/** `GET /classes` filters; the year arrives as a query string. Default status: ACTIVE + INACTIVE. */
export const ClassListQuerySchema = z.strictObject({
  query: z.string().max(120).optional(),
  year: z.coerce.number().pipe(AcademicYearSchema).optional(),
  status: ClassStatusSchema.optional(),
  /** The offerings of one subject (004). */
  subjectId: UuidSchema.optional(),
  cursor: z.string().max(200).optional(),
});
export type ClassListQuery = z.infer<typeof ClassListQuerySchema>;

/** Keyset page; `nextCursor` is opaque to the web. */
export const ClassPageSchema = z.strictObject({
  items: z.array(ClassViewSchema),
  nextCursor: z.string().nullable(),
});
export type ClassPage = z.infer<typeof ClassPageSchema>;

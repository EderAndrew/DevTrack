import { z } from "zod";
import { IsoDateSchema, IsoDateTimeSchema, NameSchema, UuidSchema } from "../common/primitives.js";
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
 * Fields of a class without the rule between the dates, for forms that extend them
 * (a refined object cannot be extended). Requests use the refined schemas below.
 */
export const ClassFieldsSchema = z.strictObject({
  name: NameSchema,
  code: ClassCodeSchema,
  academicYear: AcademicYearSchema,
  period: z.string().trim().max(60).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  /** 004 offering: a subject of the same teacher. */
  subjectId: UuidSchema.nullable().optional(),
  startsOn: IsoDateSchema.nullable().optional(),
  endsOn: IsoDateSchema.nullable().optional(),
});
export type ClassFields = z.infer<typeof ClassFieldsSchema>;

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

export const CreateClassRequestSchema = ClassFieldsSchema.superRefine(refineClassPeriod);
export type CreateClassRequest = z.infer<typeof CreateClassRequestSchema>;

/** The same fields, all optional, at least one present. */
export const UpdateClassRequestSchema = ClassFieldsSchema.partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined))
  .superRefine(refineClassPeriod);
export type UpdateClassRequest = z.infer<typeof UpdateClassRequestSchema>;

export const ChangeClassStatusRequestSchema = z.strictObject({ status: ClassStatusSchema });
export type ChangeClassStatusRequest = z.infer<typeof ChangeClassStatusRequestSchema>;

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

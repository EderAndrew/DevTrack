import { z } from "zod";
import { IsoDateTimeSchema, NameSchema, UuidSchema } from "../common/primitives.js";
import { AcademicYearSchema, ClassStatusSchema } from "../classes/classes.js";

// The turma of the MANAGER (027 contracts/http-api.md, "MANAGER — turma"): the group of students of a period, with no
// subject of its own. Strict: unknown fields → 400.

/** The turma uses the 003 states (027/FR-004): ACTIVE ⇄ INACTIVE, ACTIVE/INACTIVE → ARCHIVED (final). */
export const CohortStatusSchema = ClassStatusSchema;
export type CohortStatus = z.infer<typeof CohortStatusSchema>;

/** 003 format; unique per ano letivo ignoring case (027/FR-002). */
export const CohortCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .regex(/^[A-Za-z0-9._-]+$/);
export type CohortCode = z.infer<typeof CohortCodeSchema>;

/** The 003 class fields (027/FR-001), now the turma's. */
const CohortFieldsSchema = z.strictObject({
  name: NameSchema,
  code: CohortCodeSchema,
  academicYear: AcademicYearSchema,
  period: z.string().trim().max(60).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
});

export const CreateCohortRequestSchema = CohortFieldsSchema;
export type CreateCohortRequest = z.infer<typeof CreateCohortRequestSchema>;

/** The same fields, all optional, at least one present. */
export const UpdateCohortRequestSchema = CohortFieldsSchema.partial().refine((value) =>
  Object.values(value).some((field) => field !== undefined),
);
export type UpdateCohortRequest = z.infer<typeof UpdateCohortRequestSchema>;

/** `POST /cohorts/:id/status`. */
export const ChangeCohortStatusRequestSchema = z.strictObject({ to: CohortStatusSchema });
export type ChangeCohortStatusRequest = z.infer<typeof ChangeCohortStatusRequestSchema>;

/** `GET /cohorts` filters; numbers arrive as query strings. Default status: ACTIVE + INACTIVE. */
export const CohortListQuerySchema = z.strictObject({
  q: z.string().max(120).optional(),
  academicYear: z.coerce.number().pipe(AcademicYearSchema).optional(),
  status: CohortStatusSchema.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().pipe(z.int().min(1).max(50)).optional(),
});
export type CohortListQuery = z.infer<typeof CohortListQuerySchema>;

export const CohortViewSchema = z.strictObject({
  id: UuidSchema,
  name: z.string(),
  code: z.string(),
  academicYear: z.int(),
  period: z.string().nullable(),
  description: z.string().nullable(),
  status: CohortStatusSchema,
  activeEnrollmentCount: z.int(),
  classCount: z.int(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type CohortView = z.infer<typeof CohortViewSchema>;

/** Keyset page, most recent first; `nextCursor` is opaque to the web. */
export const CohortPageSchema = z.strictObject({
  items: z.array(CohortViewSchema),
  nextCursor: z.string().nullable(),
});
export type CohortPage = z.infer<typeof CohortPageSchema>;

/** A disciplina da turma as the MANAGER sees it: who teaches what, never anything pedagogical (027/FR-007). */
export const CohortClassSummarySchema = z.strictObject({
  id: UuidSchema,
  /** Null only for a class migrated without a subject (027/FR-030). */
  subjectName: z.string().nullable(),
  teacherName: z.string(),
  effectiveStatus: CohortStatusSchema,
});
export type CohortClassSummary = z.infer<typeof CohortClassSummarySchema>;

export const CohortDetailSchema = z.strictObject({
  ...CohortViewSchema.shape,
  classes: z.array(CohortClassSummarySchema),
});
export type CohortDetail = z.infer<typeof CohortDetailSchema>;

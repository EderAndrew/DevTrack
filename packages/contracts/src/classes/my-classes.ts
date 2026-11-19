import { z } from "zod";
import { UuidSchema } from "../common/primitives.js";

/**
 * 027: `GET /me/classes` grouped by ano letivo, most recent first (027/FR-025): each turma once, with every disciplina
 * da turma whatever its status (read-only when not ACTIVE); it replaced the flat 003/026 `MyClassList`.
 */
export const MyCohortClassSchema = z.strictObject({
  classId: UuidSchema,
  /** Null only for a class migrated without a subject (027/FR-030). */
  subjectName: z.string().nullable(),
  teacherName: z.string(),
  effectiveStatus: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]),
});
export type MyCohortClass = z.infer<typeof MyCohortClassSchema>;

export const MyCohortSchema = z.strictObject({
  id: UuidSchema,
  name: z.string(),
  code: z.string(),
  period: z.string().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]),
  classes: z.array(MyCohortClassSchema),
});
export type MyCohort = z.infer<typeof MyCohortSchema>;

export const MyCohortListSchema = z.strictObject({
  years: z.array(z.strictObject({ academicYear: z.int(), cohorts: z.array(MyCohortSchema) })),
});
export type MyCohortList = z.infer<typeof MyCohortListSchema>;

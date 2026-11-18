import { z } from "zod";
import { UuidSchema } from "../common/primitives.js";

// `GET /cohort-directory`: the teacher's search of ACTIVE turmas (027/FR-016, constitution XXIV). Only what identifies
// a turma — never students, invitations, activities or a student count.

export const CohortDirectoryQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(100),
  cursor: z.string().max(200).optional(),
});
export type CohortDirectoryQuery = z.infer<typeof CohortDirectoryQuerySchema>;

export const CohortDirectoryItemSchema = z.strictObject({
  id: UuidSchema,
  name: z.string(),
  code: z.string(),
  academicYear: z.int(),
  period: z.string().nullable(),
  /** The disciplinas the turma already has; `subjectName` null only for a class migrated without one. */
  classes: z.array(z.strictObject({ subjectName: z.string().nullable(), teacherName: z.string() })),
});
export type CohortDirectoryItem = z.infer<typeof CohortDirectoryItemSchema>;

export const CohortDirectoryPageSchema = z.strictObject({
  items: z.array(CohortDirectoryItemSchema),
  nextCursor: z.string().nullable(),
});
export type CohortDirectoryPage = z.infer<typeof CohortDirectoryPageSchema>;

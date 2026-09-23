import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";

// Students of a class (003 contracts/http-api.md, "Alunos da turma").

/** RA as received; the API stores it trimmed and uppercased (003/FR-041). */
export const StudentRaSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9./-]+$/);
export type StudentRa = z.infer<typeof StudentRaSchema>;

export const EnrollmentStatusSchema = z.enum(["ACTIVE", "REMOVED"]);
export type EnrollmentStatus = z.infer<typeof EnrollmentStatusSchema>;

export const EnrollmentViewSchema = z.strictObject({
  id: UuidSchema,
  student: z.strictObject({
    userId: UuidSchema,
    name: z.string(),
    email: z.email(),
    ra: z.string().nullable(),
  }),
  status: EnrollmentStatusSchema,
  enrolledAt: IsoDateTimeSchema,
  removedAt: IsoDateTimeSchema.nullable(),
});
export type EnrollmentView = z.infer<typeof EnrollmentViewSchema>;

/** Search by name or RA prefix; default status ACTIVE, ordered by name. */
export const EnrollmentListQuerySchema = z.strictObject({
  query: z.string().max(120).optional(),
  status: EnrollmentStatusSchema.optional(),
  cursor: z.string().max(200).optional(),
});
export type EnrollmentListQuery = z.infer<typeof EnrollmentListQuerySchema>;

export const EnrollmentPageSchema = z.strictObject({
  items: z.array(EnrollmentViewSchema),
  nextCursor: z.string().nullable(),
});
export type EnrollmentPage = z.infer<typeof EnrollmentPageSchema>;

import { z } from "zod";
import { IsoDateTimeSchema, NameSchema, UuidSchema } from "../common/primitives.js";

// Classes of a teacher (003 contracts/http-api.md, "Turmas"). Strict: unknown fields → 400.

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

const ClassFieldsSchema = z.strictObject({
  name: NameSchema,
  code: ClassCodeSchema,
  academicYear: AcademicYearSchema,
  period: z.string().trim().max(60).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
});

export const CreateClassRequestSchema = ClassFieldsSchema;
export type CreateClassRequest = z.infer<typeof CreateClassRequestSchema>;

/** The same fields, all optional, at least one present. */
export const UpdateClassRequestSchema = ClassFieldsSchema.partial().refine((value) =>
  Object.values(value).some((field) => field !== undefined),
);
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
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ClassView = z.infer<typeof ClassViewSchema>;

/** `GET /classes` filters; the year arrives as a query string. Default status: ACTIVE + INACTIVE. */
export const ClassListQuerySchema = z.strictObject({
  query: z.string().max(120).optional(),
  year: z.coerce.number().pipe(AcademicYearSchema).optional(),
  status: ClassStatusSchema.optional(),
  cursor: z.string().max(200).optional(),
});
export type ClassListQuery = z.infer<typeof ClassListQuerySchema>;

/** Keyset page; `nextCursor` is opaque to the web. */
export const ClassPageSchema = z.strictObject({
  items: z.array(ClassViewSchema),
  nextCursor: z.string().nullable(),
});
export type ClassPage = z.infer<typeof ClassPageSchema>;

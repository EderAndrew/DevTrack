import { z } from "zod";
import { IsoDateTimeSchema, NameSchema, UuidSchema } from "../common/primitives.js";

// Subjects of a teacher (004 contracts/http-api.md, "Disciplinas"). Strict: unknown fields → 400.

export const SubjectStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export type SubjectStatus = z.infer<typeof SubjectStatusSchema>;

const SubjectFieldsSchema = z.strictObject({
  /** 1–120 characters after trim; unique per teacher ignoring case (004/FR-002). */
  name: NameSchema,
  description: z.string().trim().max(1000).nullable().optional(),
});

export const CreateSubjectRequestSchema = SubjectFieldsSchema;
export type CreateSubjectRequest = z.infer<typeof CreateSubjectRequestSchema>;

/** The same fields, all optional, at least one present. */
export const UpdateSubjectRequestSchema = SubjectFieldsSchema.partial().refine((value) =>
  Object.values(value).some((field) => field !== undefined),
);
export type UpdateSubjectRequest = z.infer<typeof UpdateSubjectRequestSchema>;

export const ChangeSubjectStatusRequestSchema = z.strictObject({ status: SubjectStatusSchema });
export type ChangeSubjectStatusRequest = z.infer<typeof ChangeSubjectStatusRequestSchema>;

export const SubjectViewSchema = z.strictObject({
  id: UuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  status: SubjectStatusSchema,
  /** Classes that are offerings of this subject. */
  classCount: z.int(),
  /** Syllabus document versions. */
  documentCount: z.int(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type SubjectView = z.infer<typeof SubjectViewSchema>;

/** `GET /subjects` filters. Without `status`, both situations are listed. */
export const SubjectListQuerySchema = z.strictObject({
  query: z.string().max(120).optional(),
  status: SubjectStatusSchema.optional(),
  cursor: z.string().max(200).optional(),
});
export type SubjectListQuery = z.infer<typeof SubjectListQuerySchema>;

/** Keyset page by name, 50 per page; `nextCursor` is opaque to the web. */
export const SubjectPageSchema = z.strictObject({
  items: z.array(SubjectViewSchema),
  nextCursor: z.string().nullable(),
});
export type SubjectPage = z.infer<typeof SubjectPageSchema>;

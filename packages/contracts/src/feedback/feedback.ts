import { z } from "zod";
import { EmailSchema, IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { FeedbackCategorySchema, FeedbackStatusSchema } from "./enums.js";

// Student feedback (020 contracts/http-api.md). The student, the status and the time come from the
// server (FR-002); the student shape is built from an allowlist (`student-feedback/views/student-feedback-view.ts`).

/** Message length in code points, after trim (research J9): an emoji counts as one character. */
export const FEEDBACK_MESSAGE_MIN = 10;
export const FEEDBACK_MESSAGE_MAX = 2000;
/** Code points of the message shown in the ADMIN list. */
export const FEEDBACK_EXCERPT_LENGTH = 140;
/** New feedbacks per student in 24 h (research J4); more → `429 RATE_LIMITED`. */
export const FEEDBACK_DAILY_LIMIT = 5;

const codePoints = (value: string) => [...value].length;

/** Trimmed text of 10–2 000 code points, no NUL (PostgreSQL refuses it in `text`, research J9). */
export const FeedbackMessageSchema = z
  .string()
  .trim()
  .refine((value) => codePoints(value) >= FEEDBACK_MESSAGE_MIN && codePoints(value) <= FEEDBACK_MESSAGE_MAX)
  .refine((value) => !value.includes("\u0000"));
export type FeedbackMessage = z.infer<typeof FeedbackMessageSchema>;

/**
 * The page the student sent it from (research J2): a pathname only, so no query, fragment, space or
 * `%` (the query carries tokens on some pages). Never `//…` (protocol-relative) nor a `..` segment, so
 * it can't point outside the portal. The web sends it only when it passes this schema.
 */
export const OriginPathSchema = z
  .string()
  .max(200)
  .regex(/^\/(?!\/)[A-Za-z0-9/_.-]*$/)
  .refine((value) => !value.split("/").includes(".."));
export type OriginPath = z.infer<typeof OriginPathSchema>;

/** `POST /me/feedbacks`; `submissionId` is generated when the dialog opens (research J3). */
export const CreateFeedbackRequestSchema = z.strictObject({
  submissionId: UuidSchema,
  category: FeedbackCategorySchema,
  message: FeedbackMessageSchema,
  originPath: OriginPathSchema.nullable().optional(),
});
export type CreateFeedbackRequest = z.infer<typeof CreateFeedbackRequestSchema>;

/** What the student sees of their own feedback: never the history, who changed it, the origin or the submission id. */
export const StudentFeedbackSchema = z.strictObject({
  id: UuidSchema,
  category: FeedbackCategorySchema,
  message: z.string(),
  status: FeedbackStatusSchema,
  createdAt: IsoDateTimeSchema,
});
export type StudentFeedback = z.infer<typeof StudentFeedbackSchema>;

export const ListMyFeedbacksQuerySchema = z.strictObject({
  /** Opaque, from the previous page's `nextCursor`. */
  cursor: z.string().max(200).optional(),
});
export type ListMyFeedbacksQuery = z.infer<typeof ListMyFeedbacksQuerySchema>;

/** Keyset page, newest first, 50 per page; `nextCursor` is opaque to the web. */
export const StudentFeedbackPageSchema = z.strictObject({
  items: z.array(StudentFeedbackSchema),
  nextCursor: z.string().nullable(),
});
export type StudentFeedbackPage = z.infer<typeof StudentFeedbackPageSchema>;

/** `student.name` is the student profile's display name (003), falling back to the account name. */
const FeedbackStudentSchema = z.strictObject({ id: UuidSchema, name: z.string() });

export const AdminFeedbackListItemSchema = z.strictObject({
  id: UuidSchema,
  category: FeedbackCategorySchema,
  status: FeedbackStatusSchema,
  /** The first `FEEDBACK_EXCERPT_LENGTH` code points of the message. */
  excerpt: z.string(),
  student: FeedbackStudentSchema,
  createdAt: IsoDateTimeSchema,
});
export type AdminFeedbackListItem = z.infer<typeof AdminFeedbackListItemSchema>;

export const ListAdminFeedbacksQuerySchema = z.strictObject({
  status: FeedbackStatusSchema.optional(),
  category: FeedbackCategorySchema.optional(),
  /** Opaque, from the previous page's `nextCursor`. */
  cursor: z.string().max(200).optional(),
});
export type ListAdminFeedbacksQuery = z.infer<typeof ListAdminFeedbacksQuerySchema>;

export const AdminFeedbackPageSchema = z.strictObject({
  items: z.array(AdminFeedbackListItemSchema),
  nextCursor: z.string().nullable(),
});
export type AdminFeedbackPage = z.infer<typeof AdminFeedbackPageSchema>;

/** One status change, from the append-only `student_feedback_status_changes`. */
export const FeedbackStatusChangeSchema = z.strictObject({
  fromStatus: FeedbackStatusSchema,
  toStatus: FeedbackStatusSchema,
  changedBy: z.strictObject({ id: UuidSchema, name: z.string() }),
  changedAt: IsoDateTimeSchema,
});
export type FeedbackStatusChange = z.infer<typeof FeedbackStatusChangeSchema>;

export const AdminFeedbackSchema = z.strictObject({
  id: UuidSchema,
  category: FeedbackCategorySchema,
  status: FeedbackStatusSchema,
  message: z.string(),
  originPath: OriginPathSchema.nullable(),
  student: FeedbackStudentSchema.extend({ email: EmailSchema }),
  createdAt: IsoDateTimeSchema,
  statusChangedAt: IsoDateTimeSchema,
  /** Oldest first. */
  history: z.array(FeedbackStatusChangeSchema),
});
export type AdminFeedback = z.infer<typeof AdminFeedbackSchema>;

/** `GET /feedbacks/summary`: the badge of the ADMIN menu. */
export const FeedbackSummarySchema = z.strictObject({ received: z.int().min(0) });
export type FeedbackSummary = z.infer<typeof FeedbackSummarySchema>;

/** `POST /feedbacks/:id/status`: never back to RECEIVED (400). */
export const ChangeFeedbackStatusRequestSchema = z.strictObject({
  status: FeedbackStatusSchema.exclude(["RECEIVED"]),
});
export type ChangeFeedbackStatusRequest = z.infer<typeof ChangeFeedbackStatusRequestSchema>;

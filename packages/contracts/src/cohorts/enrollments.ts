import { z } from "zod";
import { EmailSchema, IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { EnrollmentStatusSchema } from "../classes/enrollments.js";

// Students of a turma, as the MANAGER sees and manages them (027 contracts/http-api.md): the lookup by exact e-mail and
// the direct enrollment of an existing student (027/FR-034, constitution 4.1.0), and the enrollment list. The list's
// query is the 003 `EnrollmentListQuerySchema`.

/** How the enrollment was born: the 003 invitation or the MANAGER's direct enrollment. */
export const EnrollmentSourceSchema = z.enum(["INVITATION", "DIRECT"]);
export type EnrollmentSource = z.infer<typeof EnrollmentSourceSchema>;

/** The e-mail goes in a POST body, never in a URL (research Q7). */
export const StudentLookupRequestSchema = z.strictObject({ email: EmailSchema });
export type StudentLookupRequest = z.infer<typeof StudentLookupRequestSchema>;

/**
 * `found` only for an ACTIVE account with the STUDENT role and a verified e-mail; every other case (no account, not a
 * student, unverified, deactivated) is the same `{ found: false }`. Of the account, only the name.
 */
export const StudentLookupResponseSchema = z.discriminatedUnion("found", [
  z.strictObject({
    found: z.literal(true),
    studentUserId: UuidSchema,
    name: z.string(),
    /** An ACTIVE enrollment in this turma already exists ("Esse aluno já está na turma."). */
    alreadyEnrolled: z.boolean(),
  }),
  z.strictObject({ found: z.literal(false) }),
]);
export type StudentLookupResponse = z.infer<typeof StudentLookupResponseSchema>;

/** The server resolves the e-mail again; never an id from the body. */
export const DirectEnrollmentRequestSchema = z.strictObject({ email: EmailSchema });
export type DirectEnrollmentRequest = z.infer<typeof DirectEnrollmentRequestSchema>;

export const CohortEnrollmentViewSchema = z.strictObject({
  id: UuidSchema,
  student: z.strictObject({
    userId: UuidSchema,
    name: z.string(),
    email: z.email(),
  }),
  status: EnrollmentStatusSchema,
  source: EnrollmentSourceSchema,
  enrolledAt: IsoDateTimeSchema,
  removedAt: IsoDateTimeSchema.nullable(),
});
export type CohortEnrollmentView = z.infer<typeof CohortEnrollmentViewSchema>;

export const CohortEnrollmentPageSchema = z.strictObject({
  items: z.array(CohortEnrollmentViewSchema),
  nextCursor: z.string().nullable(),
});
export type CohortEnrollmentPage = z.infer<typeof CohortEnrollmentPageSchema>;

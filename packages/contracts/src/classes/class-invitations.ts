import { z } from "zod";
import { AcceptanceModeSchema } from "../common/enums.js";
import {
  EmailSchema,
  IsoDateTimeSchema,
  NameSchema,
  PasswordInputSchema,
  TokenSchema,
  UuidSchema,
} from "../common/primitives.js";
import { StudentRaSchema } from "./enrollments.js";

// Class invitations: the teacher's routes and the public acceptance (003 contracts/http-api.md).

export const ClassInvitationStatusSchema = z.enum(["PENDING", "ACCEPTED", "EXPIRED", "CANCELLED"]);
export type ClassInvitationStatus = z.infer<typeof ClassInvitationStatusSchema>;

/**
 * State of the latest delivery of the e-mail (003 D5); 017 adds UNDELIVERED, when the provider
 * says the e-mail did not reach the recipient ("Não entregue").
 */
export const DeliveryStateSchema = z.enum(["SENDING", "SENT", "FAILED", "UNDELIVERED"]);
export type DeliveryState = z.infer<typeof DeliveryStateSchema>;

/** Why an e-mail is UNDELIVERED (017 data-model `undelivered_reason`). */
export const DeliveryIssueSchema = z.enum(["BOUNCED", "COMPLAINED", "REJECTED"]);
export type DeliveryIssue = z.infer<typeof DeliveryIssueSchema>;

/** `deliveryIssue` is set exactly when `delivery` is UNDELIVERED (017 contracts/http-api.md). */
export function refineDeliveryIssue(
  view: { delivery: DeliveryState; deliveryIssue: DeliveryIssue | null },
  ctx: z.core.$RefinementCtx,
): void {
  if ((view.delivery === "UNDELIVERED") !== (view.deliveryIssue !== null)) {
    ctx.addIssue({ code: "custom", path: ["deliveryIssue"] });
  }
}

export const InviteStudentRequestSchema = z.strictObject({ email: EmailSchema });
export type InviteStudentRequest = z.infer<typeof InviteStudentRequestSchema>;

/** Never the token nor its hash. `status` is the effective one (a PENDING past expiry is EXPIRED). */
export const ClassInvitationViewSchema = z.strictObject({
  id: UuidSchema,
  email: z.email(),
  status: ClassInvitationStatusSchema,
  expiresAt: IsoDateTimeSchema,
  sendCount: z.int(),
  lastSentAt: IsoDateTimeSchema,
  delivery: DeliveryStateSchema,
  deliveryIssue: DeliveryIssueSchema.nullable(),
  createdAt: IsoDateTimeSchema,
}).superRefine(refineDeliveryIssue);
export type ClassInvitationView = z.infer<typeof ClassInvitationViewSchema>;

/** Search by part of the e-mail; default status PENDING. */
export const ClassInvitationListQuerySchema = z.strictObject({
  query: z.string().max(254).optional(),
  status: ClassInvitationStatusSchema.optional(),
  cursor: z.string().max(200).optional(),
});
export type ClassInvitationListQuery = z.infer<typeof ClassInvitationListQuerySchema>;

export const ClassInvitationPageSchema = z.strictObject({
  items: z.array(ClassInvitationViewSchema),
  nextCursor: z.string().nullable(),
});
export type ClassInvitationPage = z.infer<typeof ClassInvitationPageSchema>;

export const ClassInvitationPreviewSchema = z.strictObject({
  class: z.strictObject({
    name: z.string(),
    code: z.string(),
    academicYear: z.int(),
    period: z.string().nullable(),
  }),
  teacherName: z.string(),
  email: z.email(),
  mode: AcceptanceModeSchema,
  raRequired: z.boolean(),
});
export type ClassInvitationPreview = z.infer<typeof ClassInvitationPreviewSchema>;

/**
 * Which fields are required depends on the mode (CREATE_ACCOUNT: name, ra, password; CLAIM_ACCOUNT:
 * name, password and ra if the profile has none; SIGN_IN_REQUIRED: ra if the profile has none).
 * E-mail, role and class always come from the invitation.
 */
export const AcceptClassInvitationRequestSchema = z.strictObject({
  token: TokenSchema,
  name: NameSchema.optional(),
  ra: StudentRaSchema.optional(),
  password: PasswordInputSchema.optional(),
});
export type AcceptClassInvitationRequest = z.infer<typeof AcceptClassInvitationRequestSchema>;

export const ClassInvitationAcceptedSchema = z.strictObject({
  classId: UuidSchema,
  mode: AcceptanceModeSchema,
  alreadyEnrolled: z.boolean(),
});
export type ClassInvitationAccepted = z.infer<typeof ClassInvitationAcceptedSchema>;

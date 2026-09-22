import { z } from "zod";
import { AcceptanceModeSchema, InvitableRoleSchema, InvitationStatusSchema } from "../common/enums.js";
import {
  EmailSchema,
  IsoDateTimeSchema,
  NameSchema,
  PasswordInputSchema,
  TokenSchema,
  UuidSchema,
} from "../common/primitives.js";

/** Token of an e-mail link, for previews (invitation and admin activation). */
export const TokenRequestSchema = z.strictObject({ token: TokenSchema });
export type TokenRequest = z.infer<typeof TokenRequestSchema>;

/** `password` only for CREATE_ACCOUNT/CLAIM_ACCOUNT; SIGN_IN_REQUIRED relies on the session. */
export const AcceptInvitationRequestSchema = z.strictObject({ token: TokenSchema, password: PasswordInputSchema.optional() });
export type AcceptInvitationRequest = z.infer<typeof AcceptInvitationRequestSchema>;

/** Invitation of a MANAGER (by ADMIN) or of a TEACHER (by MANAGER). */
export const InviteRequestSchema = z.strictObject({ email: EmailSchema, displayName: NameSchema });
export type InviteRequest = z.infer<typeof InviteRequestSchema>;

/** `?status=` of the invitation lists; the API reads only this parameter. */
export const InvitationListQuerySchema = z.strictObject({ status: InvitationStatusSchema.optional() });
export type InvitationListQuery = z.infer<typeof InvitationListQuerySchema>;

/** Never the token nor its hash. */
export const InvitationViewSchema = z.strictObject({
  id: UuidSchema,
  email: z.email(),
  displayName: z.string(),
  role: InvitableRoleSchema,
  status: InvitationStatusSchema,
  expiresAt: IsoDateTimeSchema,
  sendCount: z.int(),
  lastSentAt: IsoDateTimeSchema,
  invitedBy: z.strictObject({ id: UuidSchema, name: z.string() }),
});
export type InvitationView = z.infer<typeof InvitationViewSchema>;

export const InvitationListResponseSchema = z.strictObject({ items: z.array(InvitationViewSchema) });
export type InvitationListResponse = z.infer<typeof InvitationListResponseSchema>;

export const InvitationPreviewSchema = z.strictObject({
  role: InvitableRoleSchema,
  email: z.email(),
  displayName: z.string(),
  mode: AcceptanceModeSchema,
});
export type InvitationPreview = z.infer<typeof InvitationPreviewSchema>;

export const InvitationAcceptedSchema = z.strictObject({ role: InvitableRoleSchema, mode: AcceptanceModeSchema });
export type InvitationAccepted = z.infer<typeof InvitationAcceptedSchema>;

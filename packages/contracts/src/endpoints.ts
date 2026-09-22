import { z } from "zod";
import { AccountPageSchema, UserAccountViewSchema, UserListQuerySchema } from "./accounts/accounts.js";
import {
  AdminActivatedSchema,
  AdminActivationPreviewSchema,
  AdminActivationRequestSchema,
} from "./admin-activation/admin-activation.js";
import {
  LoginRequestSchema,
  PasswordResetConfirmRequestSchema,
  PasswordResetRequestSchema,
  ResendVerificationRequestSchema,
  SignupRequestSchema,
  VerifyEmailRequestSchema,
} from "./auth/requests.js";
import {
  EmailVerifiedResponseSchema,
  LoginResponseSchema,
  MessageResponseSchema,
  PublicAcceptedSchema,
} from "./auth/responses.js";
import { UuidSchema } from "./common/primitives.js";
import { HealthStatusSchema } from "./health/health.js";
import { MeViewSchema } from "./me/me.js";
import { SessionListResponseSchema, SessionViewSchema } from "./me/sessions.js";
import {
  AcceptInvitationRequestSchema,
  InvitationAcceptedSchema,
  InvitationListQuerySchema,
  InvitationListResponseSchema,
  InvitationPreviewSchema,
  InvitationViewSchema,
  InviteRequestSchema,
  TokenRequestSchema,
} from "./provisioning/invitations.js";
import { ManagerListResponseSchema, ManagerViewSchema } from "./provisioning/managers.js";
import { TeacherListQuerySchema, TeacherListResponseSchema, TeacherViewSchema } from "./provisioning/teachers.js";

/** One route of the API (002 data-model §5). `path` is in Nest format, relative to `/api`. */
export interface EndpointContract {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  /** `null`: success without a body (204). */
  response: z.ZodType | null;
  /** Success status. */
  status: number;
}

export const IdParamsSchema = z.strictObject({ id: UuidSchema });
export type IdParams = z.infer<typeof IdParamsSchema>;

export const UserIdParamsSchema = z.strictObject({ userId: UuidSchema });
export type UserIdParams = z.infer<typeof UserIdParamsSchema>;

/**
 * Every route of the API, keyed `<domain>.<action>`. `apps/api/test/contracts/endpoint-catalog.spec.ts`
 * requires a two-way match with the routes registered in Nest, and the test-only conformance
 * interceptor checks each real response against `response`.
 */
export const endpoints = {
  "health.live": { method: "GET", path: "/health/live", response: HealthStatusSchema, status: 200 },
  /** 503 with `{status: "unavailable"}` when the database does not answer. */
  "health.ready": { method: "GET", path: "/health/ready", response: HealthStatusSchema, status: 200 },

  "auth.signup": { method: "POST", path: "/auth/signup", body: SignupRequestSchema, response: PublicAcceptedSchema, status: 202 },
  "auth.verifyEmail": {
    method: "POST",
    path: "/auth/verify-email",
    body: VerifyEmailRequestSchema,
    response: EmailVerifiedResponseSchema,
    status: 200,
  },
  "auth.resendVerification": {
    method: "POST",
    path: "/auth/verify-email/resend",
    body: ResendVerificationRequestSchema,
    response: PublicAcceptedSchema,
    status: 202,
  },
  "auth.login": { method: "POST", path: "/auth/login", body: LoginRequestSchema, response: LoginResponseSchema, status: 200 },
  "auth.logout": { method: "POST", path: "/auth/logout", response: null, status: 204 },
  "auth.logoutAll": { method: "POST", path: "/auth/logout-all", response: null, status: 204 },
  "auth.passwordResetRequest": {
    method: "POST",
    path: "/auth/password-reset/request",
    body: PasswordResetRequestSchema,
    response: PublicAcceptedSchema,
    status: 202,
  },
  "auth.passwordResetConfirm": {
    method: "POST",
    path: "/auth/password-reset/confirm",
    body: PasswordResetConfirmRequestSchema,
    response: MessageResponseSchema,
    status: 200,
  },

  "me.get": { method: "GET", path: "/me", response: MeViewSchema, status: 200 },
  "sessions.list": { method: "GET", path: "/me/sessions", response: SessionListResponseSchema, status: 200 },
  "sessions.get": { method: "GET", path: "/me/sessions/:id", params: IdParamsSchema, response: SessionViewSchema, status: 200 },
  "sessions.revoke": { method: "DELETE", path: "/me/sessions/:id", params: IdParamsSchema, response: null, status: 204 },

  "invitations.preview": {
    method: "POST",
    path: "/invitations/preview",
    body: TokenRequestSchema,
    response: InvitationPreviewSchema,
    status: 200,
  },
  "invitations.accept": {
    method: "POST",
    path: "/invitations/accept",
    body: AcceptInvitationRequestSchema,
    response: InvitationAcceptedSchema,
    status: 200,
  },

  "adminActivation.preview": {
    method: "POST",
    path: "/admin-activation/preview",
    body: TokenRequestSchema,
    response: AdminActivationPreviewSchema,
    status: 200,
  },
  "adminActivation.activate": {
    method: "POST",
    path: "/admin-activation",
    body: AdminActivationRequestSchema,
    response: AdminActivatedSchema,
    status: 200,
  },

  "teachers.list": { method: "GET", path: "/teachers", query: TeacherListQuerySchema, response: TeacherListResponseSchema, status: 200 },
  "teachers.get": { method: "GET", path: "/teachers/:userId", params: UserIdParamsSchema, response: TeacherViewSchema, status: 200 },
  "teachers.suspend": {
    method: "POST",
    path: "/teachers/:userId/suspend",
    params: UserIdParamsSchema,
    response: TeacherViewSchema,
    status: 200,
  },
  "teachers.deactivate": {
    method: "POST",
    path: "/teachers/:userId/deactivate",
    params: UserIdParamsSchema,
    response: TeacherViewSchema,
    status: 200,
  },
  "teachers.reactivate": {
    method: "POST",
    path: "/teachers/:userId/reactivate",
    params: UserIdParamsSchema,
    response: TeacherViewSchema,
    status: 200,
  },

  "teacherInvitations.list": {
    method: "GET",
    path: "/teacher-invitations",
    query: InvitationListQuerySchema,
    response: InvitationListResponseSchema,
    status: 200,
  },
  "teacherInvitations.create": {
    method: "POST",
    path: "/teacher-invitations",
    body: InviteRequestSchema,
    response: InvitationViewSchema,
    status: 201,
  },
  "teacherInvitations.resend": {
    method: "POST",
    path: "/teacher-invitations/:id/resend",
    params: IdParamsSchema,
    response: InvitationViewSchema,
    status: 200,
  },
  "teacherInvitations.revoke": {
    method: "POST",
    path: "/teacher-invitations/:id/revoke",
    params: IdParamsSchema,
    response: InvitationViewSchema,
    status: 200,
  },

  "managers.list": { method: "GET", path: "/managers", response: ManagerListResponseSchema, status: 200 },
  "managers.deactivate": {
    method: "POST",
    path: "/managers/:userId/deactivate",
    params: UserIdParamsSchema,
    response: ManagerViewSchema,
    status: 200,
  },
  "managers.reactivate": {
    method: "POST",
    path: "/managers/:userId/reactivate",
    params: UserIdParamsSchema,
    response: ManagerViewSchema,
    status: 200,
  },

  "managerInvitations.list": {
    method: "GET",
    path: "/manager-invitations",
    query: InvitationListQuerySchema,
    response: InvitationListResponseSchema,
    status: 200,
  },
  "managerInvitations.create": {
    method: "POST",
    path: "/manager-invitations",
    body: InviteRequestSchema,
    response: InvitationViewSchema,
    status: 201,
  },
  "managerInvitations.resend": {
    method: "POST",
    path: "/manager-invitations/:id/resend",
    params: IdParamsSchema,
    response: InvitationViewSchema,
    status: 200,
  },
  "managerInvitations.revoke": {
    method: "POST",
    path: "/manager-invitations/:id/revoke",
    params: IdParamsSchema,
    response: InvitationViewSchema,
    status: 200,
  },

  "accounts.list": { method: "GET", path: "/users", query: UserListQuerySchema, response: AccountPageSchema, status: 200 },
  "accounts.get": { method: "GET", path: "/users/:id", params: IdParamsSchema, response: UserAccountViewSchema, status: 200 },
  "accounts.suspend": {
    method: "POST",
    path: "/users/:id/suspend",
    params: IdParamsSchema,
    response: UserAccountViewSchema,
    status: 200,
  },
  "accounts.reactivate": {
    method: "POST",
    path: "/users/:id/reactivate",
    params: IdParamsSchema,
    response: UserAccountViewSchema,
    status: 200,
  },
} as const satisfies Record<string, EndpointContract>;

export type EndpointKey = keyof typeof endpoints;

import { z } from "zod";

// Public error codes of the API, in the order of ErrorCatalog in
// apps/api/src/platform/http/errors.ts (002 S8). User-facing texts are not part of the
// contract: the API keeps its own messages and the web has its own catalog.
export const ErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "WEAK_PASSWORD",
  "PASSWORD_REQUIRED",
  "TOKEN_INVALID",
  "UNAUTHENTICATED",
  "INVALID_CREDENTIALS",
  "SIGN_IN_REQUIRED",
  "FORBIDDEN",
  "EMAIL_NOT_VERIFIED",
  "ACCOUNT_SUSPENDED",
  "WRONG_ACCOUNT",
  "SELF_INVITE_FORBIDDEN",
  "SELF_ACTION_FORBIDDEN",
  "ORIGIN_NOT_ALLOWED",
  "NOT_FOUND",
  "INVALID_STATE_TRANSITION",
  "ALREADY_TEACHER",
  "ALREADY_MANAGER",
  "TEACHER_REACTIVATION_REQUIRED",
  "INVITATION_ALREADY_PENDING",
  "LAST_ADMIN_PROTECTED",
  "BOOTSTRAP_ALREADY_DONE",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** Every error response of the API: {statusCode, code, message}, nothing else. */
export const ErrorBodySchema = z.strictObject({
  statusCode: z.int(),
  code: ErrorCodeSchema,
  message: z.string(),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

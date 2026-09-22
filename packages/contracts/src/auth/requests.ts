import { z } from "zod";
import { EmailSchema, NameSchema, PasswordInputSchema, TokenSchema } from "../common/primitives.js";

// Public account requests (001/FR-010–FR-029). Strict: role, roles, permissions, isAdmin or any
// other unknown field is rejected with 400 VALIDATION_ERROR.

export const SignupRequestSchema = z.strictObject({ name: NameSchema, email: EmailSchema, password: PasswordInputSchema });
export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const VerifyEmailRequestSchema = z.strictObject({ token: TokenSchema });
export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequestSchema>;

export const ResendVerificationRequestSchema = z.strictObject({ email: EmailSchema });
export type ResendVerificationRequest = z.infer<typeof ResendVerificationRequestSchema>;

export const LoginRequestSchema = z.strictObject({ email: EmailSchema, password: PasswordInputSchema });
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const PasswordResetRequestSchema = z.strictObject({ email: EmailSchema });
export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;

export const PasswordResetConfirmRequestSchema = z.strictObject({ token: TokenSchema, password: PasswordInputSchema });
export type PasswordResetConfirmRequest = z.infer<typeof PasswordResetConfirmRequestSchema>;

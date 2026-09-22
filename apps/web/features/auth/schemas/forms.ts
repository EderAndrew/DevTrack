import {
  LoginRequestSchema,
  PasswordInputSchema,
  PasswordResetConfirmRequestSchema,
  PasswordResetRequestSchema,
  ResendVerificationRequestSchema,
  SignupRequestSchema,
} from "@repo/contracts";
import { z } from "zod";
import { fieldMessages } from "@/lib/forms/field-messages";
import { NewPasswordSchema } from "./password";

// Form schemas of the auth feature, derived from the request contracts (FR-022, 002 S9). Each
// `*Messages` is the error map passed to `zodResolver`: empty field → its Phase 001 text, any
// other contract violation → "Dados inválidos.".

export const LoginFormSchema = LoginRequestSchema.extend({ password: PasswordInputSchema.min(1) });
export type LoginFormInput = z.input<typeof LoginFormSchema>;
export const loginMessages = fieldMessages({ email: "Informe seu e-mail.", password: "Informe sua senha." });

export const SignupFormSchema = SignupRequestSchema.extend({ password: NewPasswordSchema });
export type SignupFormInput = z.input<typeof SignupFormSchema>;
export const signupMessages = fieldMessages({ name: "Informe seu nome.", email: "Informe seu e-mail." });

export const ResendVerificationFormSchema = ResendVerificationRequestSchema;
export type ResendVerificationFormInput = z.input<typeof ResendVerificationFormSchema>;
export const resendVerificationMessages = fieldMessages({ email: "Informe seu e-mail." });

export const ForgotPasswordFormSchema = PasswordResetRequestSchema;
export type ForgotPasswordFormInput = z.input<typeof ForgotPasswordFormSchema>;
export const forgotPasswordMessages = fieldMessages({ email: "Informe seu e-mail." });

/** The token comes from the link, not from the form; `confirmation` never leaves the browser. */
export const ResetPasswordFormSchema = PasswordResetConfirmRequestSchema.omit({ token: true })
  .extend({ password: NewPasswordSchema, confirmation: z.string() })
  .refine((values) => values.confirmation === values.password, {
    path: ["confirmation"],
    error: "As senhas não coincidem.",
  });
export type ResetPasswordFormInput = z.input<typeof ResetPasswordFormSchema>;
export const resetPasswordMessages = fieldMessages({});

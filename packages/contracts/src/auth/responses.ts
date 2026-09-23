import { z } from "zod";
import { MeViewSchema } from "../me/me.js";

/** Generic answer of public e-mail flows (verification resend, reset request): reveals nothing (001/SC-006). */
export const PublicAcceptedSchema = z.strictObject({ message: z.string() });
export type PublicAccepted = z.infer<typeof PublicAcceptedSchema>;

/** Confirmation of a completed password reset. */
export const MessageResponseSchema = z.strictObject({ message: z.string() });
export type MessageResponse = z.infer<typeof MessageResponseSchema>;

export const EmailVerifiedResponseSchema = z.strictObject({ emailVerified: z.literal(true) });
export type EmailVerifiedResponse = z.infer<typeof EmailVerifiedResponseSchema>;

/** The session itself travels only in the cookie. */
export const LoginResponseSchema = z.strictObject({ user: MeViewSchema });
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

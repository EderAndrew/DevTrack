import { AcceptInvitationRequestSchema } from "@repo/contracts";
import { z } from "zod";
import { InvitationPasswordSchema } from "@/features/auth/schemas/password";
import { fieldMessages } from "@/lib/forms/field-messages";

/**
 * Password of CREATE_ACCOUNT/CLAIM_ACCOUNT; the token comes from the link, not from the form, and the
 * confirmation never leaves the browser.
 */
export const AcceptancePasswordFormSchema = AcceptInvitationRequestSchema.pick({ password: true })
  .extend({ password: InvitationPasswordSchema, passwordConfirmation: z.string().min(1) })
  .refine((values) => values.password === values.passwordConfirmation, {
    path: ["passwordConfirmation"],
    error: "As senhas não conferem.",
  });
export type AcceptancePasswordFormInput = z.input<typeof AcceptancePasswordFormSchema>;
export const acceptancePasswordMessages = fieldMessages({ passwordConfirmation: "Confirme a senha." });

import { AdminActivationRequestSchema } from "@repo/contracts";
import type { z } from "zod";
import { NewPasswordSchema } from "@/features/auth/schemas/password";
import { fieldMessages } from "@/lib/forms/field-messages";

/** Password of CREATE_ACCOUNT/CLAIM_ACCOUNT; the token comes from the link, not from the form. */
export const ActivationPasswordFormSchema = AdminActivationRequestSchema.pick({ password: true }).extend({
  password: NewPasswordSchema,
});
export type ActivationPasswordFormInput = z.input<typeof ActivationPasswordFormSchema>;
export const activationPasswordMessages = fieldMessages({});

import { AcceptClassInvitationRequestSchema } from "@repo/contracts";
import { z } from "zod";
import { NewPasswordSchema } from "@/features/auth/schemas/password";
import { fieldMessages } from "@/lib/forms/field-messages";

const { shape } = AcceptClassInvitationRequestSchema;

export const PASSWORD_MISMATCH_MESSAGE = "As senhas não conferem.";

/**
 * Forms of the class invitation page (003 contracts/web-ui.md), derived from
 * `AcceptClassInvitationRequestSchema`. The token comes from the link; e-mail, role and class
 * come from the invitation. The password confirmation never leaves the browser.
 */
const accountFields = z.object({
  name: shape.name.unwrap(),
  ra: shape.ra.unwrap(),
  password: NewPasswordSchema,
  passwordConfirmation: z.string().min(1),
});

const confirmationMatches = (values: { password: string; passwordConfirmation: string }) =>
  values.password === values.passwordConfirmation;
const MISMATCH = { path: ["passwordConfirmation"], error: PASSWORD_MISMATCH_MESSAGE };

/** CREATE_ACCOUNT, and CLAIM_ACCOUNT when the profile has no RA: name, RA and password. */
export const CreateAccountFormSchema = accountFields.refine(confirmationMatches, MISMATCH);
export type CreateAccountFormInput = z.input<typeof CreateAccountFormSchema>;

/**
 * CLAIM_ACCOUNT of an account that already has an RA: name and password. `ra` stays in the shape
 * (same form values as CREATE_ACCOUNT) but is not validated nor sent.
 */
export const ClaimAccountFormSchema = accountFields.extend({ ra: z.string() }).refine(confirmationMatches, MISMATCH);

/** SIGN_IN_REQUIRED with the invited account's session, when the profile has no RA. */
export const RaFormSchema = z.object({ ra: shape.ra.unwrap() });

export const createAccountMessages = fieldMessages({
  name: "Informe seu nome completo.",
  ra: "Informe o RA.",
  passwordConfirmation: "Confirme a senha.",
});

/** API answers shown next to a field, by field. */
export const FIELD_ERROR_CODES: Readonly<Record<string, "ra" | "password">> = {
  RA_TAKEN: "ra",
  RA_REQUIRED: "ra",
  WEAK_PASSWORD: "password",
  PASSWORD_REQUIRED: "password",
};

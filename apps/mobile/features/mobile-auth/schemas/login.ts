import { PasswordInputSchema } from "@repo/contracts";
import { z } from "zod";

/**
 * The login form (as the web's `LoginFormSchema`): the contract's password rule plus the form's own
 * "empty" messages; the API normalizes and checks the e-mail again (`MobileLoginRequestSchema`).
 */
export const LoginFormSchema = z.object({
  email: z.string().trim().min(1, "Informe seu e-mail.").max(254, "Dados inválidos.").pipe(z.email("Dados inválidos.")),
  password: PasswordInputSchema.min(1, "Informe sua senha."),
});
export type LoginFormInput = z.input<typeof LoginFormSchema>;

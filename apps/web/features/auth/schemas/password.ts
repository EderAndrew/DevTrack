import { PasswordInputSchema } from "@repo/contracts";

// Length hint of the password fields (001/FR-011). Strength stays on the server: the API answers
// WEAK_PASSWORD, shown as today. Also used by the invitation and admin-activation forms.

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Password length in characters as the API counts it (code points), for UX hints only. */
export const passwordLength = (password: string) => [...password].length;

export const PASSWORD_HINT = `De ${PASSWORD_MIN_LENGTH} a ${PASSWORD_MAX_LENGTH} caracteres. Evite senhas comuns.`;
export const PASSWORD_LENGTH_MESSAGE = `A senha deve ter de ${PASSWORD_MIN_LENGTH} a ${PASSWORD_MAX_LENGTH} caracteres.`;

/** The contract's password input plus the length hint, with the hint's own text (also when empty). */
export const NewPasswordSchema = PasswordInputSchema.refine(
  (password) => {
    const length = passwordLength(password);
    return length >= PASSWORD_MIN_LENGTH && length <= PASSWORD_MAX_LENGTH;
  },
  { error: PASSWORD_LENGTH_MESSAGE },
);

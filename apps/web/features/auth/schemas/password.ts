import {
  INVITATION_PASSWORD_MAX_LENGTH,
  INVITATION_PASSWORD_MIN_LENGTH,
  meetsInvitationPasswordRules,
  PasswordInputSchema,
} from "@repo/contracts";

// Hints of the password fields. The final word is the server's: the API answers WEAK_PASSWORD, also
// for a common password, which the forms don't check. The first rule (001/FR-011) serves the password
// reset and the admin activation, the second (001/FR-011a) the two invitations.

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

const INVITATION_RULES = `${INVITATION_PASSWORD_MIN_LENGTH} a ${INVITATION_PASSWORD_MAX_LENGTH} caracteres, com pelo menos 1 letra maiúscula, 1 minúscula, 1 número e 1 caractere especial`;

export const INVITATION_PASSWORD_HINT = `De ${INVITATION_RULES}. Não use palavras comuns, mesmo com números e símbolos.`;
export const INVITATION_PASSWORD_MESSAGE = `A senha deve ter de ${INVITATION_RULES}.`;

/** The password chosen when accepting an invitation, with the hint's own text (also when empty). */
export const InvitationPasswordSchema = PasswordInputSchema.refine(meetsInvitationPasswordRules, {
  error: INVITATION_PASSWORD_MESSAGE,
});

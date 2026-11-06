export const INVITATION_PASSWORD_MIN_LENGTH = 8;
export const INVITATION_PASSWORD_MAX_LENGTH = 128;

/** Uppercase, lowercase, number and special character, of any alphabet. */
const REQUIRED_KINDS = [/\p{Lu}/u, /\p{Ll}/u, /\p{Nd}/u, /[\p{P}\p{S}]/u];

/**
 * Length and composition of a password chosen when accepting an invitation (001/FR-011a), so the API
 * and the form read the same rule. Stored passwords are never checked against it: login takes any.
 */
export function meetsInvitationPasswordRules(password: string): boolean {
  // Length in code points, so a character outside the BMP counts once.
  const { length } = [...password];
  return (
    length >= INVITATION_PASSWORD_MIN_LENGTH &&
    length <= INVITATION_PASSWORD_MAX_LENGTH &&
    REQUIRED_KINDS.every((kind) => kind.test(password))
  );
}

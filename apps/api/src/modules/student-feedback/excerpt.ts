// The message's excerpt in the ADMIN list (020 contracts/http-api.md). Pure, no imports.

/** Code points of the excerpt; `FEEDBACK_EXCERPT_LENGTH` of the contract (checked by its test). */
export const EXCERPT_LENGTH = 140;

/** The first 140 code points of the message, so a cut never splits a surrogate pair. */
export function excerpt(message: string): string {
  const codePoints = [...message];
  return codePoints.length <= EXCERPT_LENGTH ? message : codePoints.slice(0, EXCERPT_LENGTH).join("");
}

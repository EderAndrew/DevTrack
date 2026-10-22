/**
 * Colours of the e-mails: copies of the tokens of `apps/web/design-system/tokens.css` (017 research
 * N9; one dark Vice City theme since 005 FR-013 was amended on 2026-10-22), inline because e-mail
 * clients ignore stylesheets. `apps/web/test/mail-tokens.test.ts` keeps each value equal to its token.
 */
export const MAIL_TOKENS = {
  /** --primary: the DevTrack name, the button and the written-out link. */
  primary: "#ff5ca8",
  /** --primary-foreground: the button's text. */
  primaryForeground: "#0b0f2b",
  /** --foreground: heading and paragraphs. */
  foreground: "#f2eeff",
  /** --text-secondary: the expiry, the hint over the link and the footer. */
  textSecondary: "#aaa6d4",
  /** --background: around the card. */
  background: "#0b0f2b",
  /** --surface: the card. */
  surface: "#151a3d",
  /** --border: the card's border and the footer's rule. */
  border: "#2b305e",
} as const;

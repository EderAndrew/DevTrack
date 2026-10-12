/**
 * Colours of the e-mails: copies of the light-theme tokens of `apps/web/design-system/tokens.css`
 * (017 research N9), inline because e-mail clients ignore stylesheets. `apps/web/test/mail-tokens.test.ts`
 * keeps each value equal to its token; dark mode is left to the client.
 */
export const MAIL_TOKENS = {
  /** --primary: the DevTrack name, the button and the written-out link. */
  primary: "#2563eb",
  /** --primary-foreground: the button's text. */
  primaryForeground: "#ffffff",
  /** --foreground: heading and paragraphs. */
  foreground: "#0f172a",
  /** --text-secondary: the expiry, the hint over the link and the footer. */
  textSecondary: "#64748b",
  /** --background: around the card. */
  background: "#f8fafc",
  /** --surface: the card. */
  surface: "#ffffff",
  /** --border: the card's border and the footer's rule. */
  border: "#e2e8f0",
} as const;

/**
 * Post-login destination: only a path of this app (`/…`), never `//host` or `/\host`, so a
 * crafted `?next=` cannot send the user to another site. Defaults to the sessions page.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/conta/sessoes"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

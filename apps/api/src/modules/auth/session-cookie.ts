import type { CookieOptions, Request, Response } from "express";

/** `__Host-` prefix: Secure, Path=/ and no Domain, so subdomains cannot inject it (R5). */
export const SESSION_COOKIE_NAME = "__Host-devtrack_session";

const BASE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
};

/** The only place that touches the session cookie. The secret never appears in a body. */
export const SessionCookie = {
  set(res: Response, secret: string, expiresAt: Date): void {
    res.cookie(SESSION_COOKIE_NAME, secret, { ...BASE_OPTIONS, expires: expiresAt });
  },

  clear(res: Response): void {
    res.clearCookie(SESSION_COOKIE_NAME, BASE_OPTIONS);
  },

  read(req: Request): string | null {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const value = cookies?.[SESSION_COOKIE_NAME];
    return typeof value === "string" && value.length > 0 ? value : null;
  },
};

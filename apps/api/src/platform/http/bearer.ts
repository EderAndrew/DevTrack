import type { Request } from "express";

/**
 * The app's session secret from `Authorization: Bearer <secret>` (024 research Y3, Y4), or null. Other
 * schemes are not a session and are ignored.
 */
export function readBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const match = /^Bearer ([^\s]+)$/.exec(header.trim());
  return match ? match[1]! : null;
}

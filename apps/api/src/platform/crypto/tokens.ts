import { createHash, createHmac, randomBytes } from "node:crypto";

/** 32 random bytes in base64url (43 characters) — session secrets and single-use tokens (R5, R7). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * SHA-256 (hex) of a high-entropy token. Only this hash is stored; lookups by hash avoid
 * variable-time string comparison. A slow hash is unnecessary for 256-bit secrets.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** HMAC-SHA-256 of `scope:value` — rate-limit keys never store e-mails or IPs in clear (R8). */
export function hmacKey(secret: Buffer, scope: string, value: string): string {
  return createHmac("sha256", secret).update(`${scope}:${value}`, "utf8").digest("hex");
}

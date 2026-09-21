import { z } from "zod";

/** Normalized e-mail (trim + lowercase, FR-001), at most 254 characters. */
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/** Display name: 1–120 characters after trim, no control characters. */
export const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => !CONTROL_CHARS.test(value));

/** Single-use token: 32 random bytes in base64url (43 characters, R7). */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** Password as received; strength rules live in PasswordPolicy (FR-011). The cap bounds hashing cost. */
export const passwordInputSchema = z.string().max(1024);

export const uuidSchema = z.uuid();

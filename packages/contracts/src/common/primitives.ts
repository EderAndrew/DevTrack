import { z } from "zod";

// Copied from apps/api/src/platform/http/schemas.ts (Phase 001) without changing any rule (FR-008).

/** Normalized e-mail (trim + lowercase, 001/FR-001), at most 254 characters. */
export const EmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export type Email = z.infer<typeof EmailSchema>;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/** Display name: 1–120 characters after trim, no control characters. */
export const NameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => !CONTROL_CHARS.test(value));
export type Name = z.infer<typeof NameSchema>;

/** Single-use token: 32 random bytes in base64url (43 characters, 001/R7). */
export const TokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export type Token = z.infer<typeof TokenSchema>;

/** Password as received; strength rules stay on the server (001/FR-011). The cap bounds hashing cost. */
export const PasswordInputSchema = z.string().max(1024);
export type PasswordInput = z.infer<typeof PasswordInputSchema>;

export const UuidSchema = z.uuid();
export type Uuid = z.infer<typeof UuidSchema>;

/** Dates in responses travel as ISO 8601 strings, as JSON carries them (002 S4). */
export const IsoDateTimeSchema = z.iso.datetime();
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

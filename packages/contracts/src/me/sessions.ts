import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";

/** One of the caller's own sessions. `id` is the public identifier, never the secret. */
export const SessionViewSchema = z.strictObject({
  id: UuidSchema,
  createdAt: IsoDateTimeSchema,
  lastUsedAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
  current: z.boolean(),
});
export type SessionView = z.infer<typeof SessionViewSchema>;

export const SessionListResponseSchema = z.strictObject({ items: z.array(SessionViewSchema) });
export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;

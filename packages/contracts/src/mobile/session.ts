import { z } from "zod";
import { LoginRequestSchema } from "../auth/requests.js";
import { IsoDateTimeSchema, TokenSchema } from "../common/primitives.js";
import { MeViewSchema } from "../me/me.js";

// 024 (contracts/http-api.md, research Y3): the app's sign-in opens a MOBILE kind of the same opaque
// session. The credentials follow exactly the web's rules.

/** `POST /auth/mobile/sessions`: the same strict body as the web login. */
export const MobileLoginRequestSchema = LoginRequestSchema;
export type MobileLoginRequest = z.infer<typeof MobileLoginRequestSchema>;

/**
 * The only place the session secret ever appears: the app keeps it in `expo-secure-store` and sends it as
 * `Authorization: Bearer <token>`; the database keeps only its hash.
 */
export const MobileSessionSchema = z.strictObject({
  token: TokenSchema,
  expiresAt: IsoDateTimeSchema,
  user: MeViewSchema,
});
export type MobileSession = z.infer<typeof MobileSessionSchema>;

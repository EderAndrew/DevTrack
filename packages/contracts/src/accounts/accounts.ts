import { z } from "zod";
import { AccountStatusSchema } from "../common/enums.js";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { RoleAssignmentSchema } from "../me/me.js";

/** `GET /users` filters (ADMIN). Copied from the Phase 001 controller without changing limits. */
export const UserListQuerySchema = z.strictObject({
  query: z.string().max(120).optional(),
  cursor: z.string().max(200).optional(),
});
export type UserListQuery = z.infer<typeof UserListQuerySchema>;

/** Identity only, never academic data (001/FR-056). */
export const UserAccountViewSchema = z.strictObject({
  id: UuidSchema,
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  status: AccountStatusSchema,
  roles: z.array(RoleAssignmentSchema),
  createdAt: IsoDateTimeSchema,
});
export type UserAccountView = z.infer<typeof UserAccountViewSchema>;

/** Keyset page; `nextCursor` is opaque to the web. */
export const AccountPageSchema = z.strictObject({
  items: z.array(UserAccountViewSchema),
  nextCursor: z.string().nullable(),
});
export type AccountPage = z.infer<typeof AccountPageSchema>;

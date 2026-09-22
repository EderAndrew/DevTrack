import { z } from "zod";
import { RoleAssignmentStatusSchema, RoleKeySchema } from "../common/enums.js";
import { UuidSchema } from "../common/primitives.js";

export const RoleAssignmentSchema = z.strictObject({ key: RoleKeySchema, status: RoleAssignmentStatusSchema });
export type RoleAssignment = z.infer<typeof RoleAssignmentSchema>;

/** `GET /me`. `permissions` only drive the web UX; the API authorizes every request. */
export const MeViewSchema = z.strictObject({
  id: UuidSchema,
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  roles: z.array(RoleAssignmentSchema),
  permissions: z.array(z.string()),
});
export type MeView = z.infer<typeof MeViewSchema>;

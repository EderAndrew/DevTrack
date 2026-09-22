import { z } from "zod";
import { RoleAssignmentStatusSchema } from "../common/enums.js";
import { UuidSchema } from "../common/primitives.js";

export const ManagerViewSchema = z.strictObject({
  userId: UuidSchema,
  name: z.string(),
  email: z.email(),
  status: RoleAssignmentStatusSchema,
});
export type ManagerView = z.infer<typeof ManagerViewSchema>;

export const ManagerListResponseSchema = z.strictObject({ items: z.array(ManagerViewSchema) });
export type ManagerListResponse = z.infer<typeof ManagerListResponseSchema>;

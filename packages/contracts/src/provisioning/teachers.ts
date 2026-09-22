import { z } from "zod";
import { RoleAssignmentStatusSchema, TeacherStatusSchema } from "../common/enums.js";
import { UuidSchema } from "../common/primitives.js";
import { InvitationViewSchema } from "./invitations.js";

/** `?status=` of the teacher list; the API reads only this parameter. */
export const TeacherListQuerySchema = z.strictObject({ status: TeacherStatusSchema.optional() });
export type TeacherListQuery = z.infer<typeof TeacherListQuerySchema>;

/** An INVITED teacher has only an invitation; an assigned one has only a user. */
export const TeacherListItemSchema = z.strictObject({
  userId: UuidSchema.nullable(),
  invitationId: UuidSchema.nullable(),
  displayName: z.string(),
  email: z.email(),
  status: TeacherStatusSchema,
});
export type TeacherListItem = z.infer<typeof TeacherListItemSchema>;

export const TeacherListResponseSchema = z.strictObject({ items: z.array(TeacherListItemSchema) });
export type TeacherListResponse = z.infer<typeof TeacherListResponseSchema>;

/** Teaching data only — no other role of the identity (001/FR-050). */
export const TeacherViewSchema = z.strictObject({
  userId: UuidSchema,
  displayName: z.string(),
  email: z.email(),
  status: RoleAssignmentStatusSchema,
  invitations: z.array(InvitationViewSchema),
});
export type TeacherView = z.infer<typeof TeacherViewSchema>;

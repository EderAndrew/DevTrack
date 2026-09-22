import { z } from "zod";

// Public enums of Phase 001 (data-model §2). Values match apps/api/prisma/schema.prisma and the
// API's literal unions; the contract never imports the Prisma-generated enums.

/** Order kept from ROLE_KEYS in apps/api/src/modules/access-control/permissions.ts. */
export const RoleKeySchema = z.enum(["ADMIN", "MANAGER", "TEACHER", "STUDENT"]);
export type RoleKey = z.infer<typeof RoleKeySchema>;

export const RoleAssignmentStatusSchema = z.enum(["ACTIVE", "SUSPENDED", "INACTIVE"]);
export type RoleAssignmentStatus = z.infer<typeof RoleAssignmentStatusSchema>;

export const AccountStatusSchema = z.enum(["ACTIVE", "SUSPENDED"]);
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

export const InvitationStatusSchema = z.enum(["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"]);
export type InvitationStatus = z.infer<typeof InvitationStatusSchema>;

export const InvitableRoleSchema = z.enum(["MANAGER", "TEACHER"]);
export type InvitableRole = z.infer<typeof InvitableRoleSchema>;

/** A teacher is INVITED while the invitation is pending, then follows the role assignment status. */
export const TeacherStatusSchema = z.enum(["INVITED", "ACTIVE", "SUSPENDED", "INACTIVE"]);
export type TeacherStatus = z.infer<typeof TeacherStatusSchema>;

export const AcceptanceModeSchema = z.enum(["CREATE_ACCOUNT", "SIGN_IN_REQUIRED", "CLAIM_ACCOUNT"]);
export type AcceptanceMode = z.infer<typeof AcceptanceModeSchema>;

export const HealthStatusValueSchema = z.enum(["ok", "unavailable"]);
export type HealthStatusValue = z.infer<typeof HealthStatusValueSchema>;

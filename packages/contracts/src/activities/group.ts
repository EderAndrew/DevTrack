import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";

// Group work (023 contracts/http-api.md, research U1–U19). The group shares one attempt edited by one
// participant at a time; ids of leader, editor, group, attempt, times and sizes never come from a body.

/** Participants of a group work, leader included (FR-001). */
export const GroupSizeSchema = z.number().int().min(2).max(5);
export type GroupSize = z.infer<typeof GroupSizeSchema>;

export const GroupEventKindSchema = z.enum([
  "EDITING_HANDED",
  "EDITING_TAKEN_BACK",
  "EDITING_RETURNED",
  "EDITING_RESET",
  "LEADER_CHANGED",
]);
export type GroupEventKind = z.infer<typeof GroupEventKindSchema>;

/** Why the system settlement moved the editing or the leadership (U9). */
export const GroupEventReasonSchema = z.enum(["PAUSED", "ACCESS_LOST"]);
export type GroupEventReason = z.infer<typeof GroupEventReasonSchema>;

const GroupPersonSchema = z.strictObject({ id: UuidSchema, name: z.string() });
const hasNoRepeats = (ids: readonly string[]) => new Set(ids).size === ids.length;

/** The caller's group in an activity, inside `StudentActivity.group`. */
export const StudentGroupSchema = z.strictObject({
  groupSize: GroupSizeSchema,
  leader: GroupPersonSchema,
  /** Every participant, leader included, by `joinedAt`. */
  members: z.array(GroupPersonSchema).min(1).max(5),
  /** The effective editor. */
  editor: GroupPersonSchema,
  myRole: z.enum(["LEADER", "MEMBER"]),
  /** The caller is the effective editor and is not paused. */
  canEdit: z.boolean(),
  /** Who added the caller, for the notice; `null` for the leader. */
  addedBy: GroupPersonSchema.nullable(),
  freeSlots: z.int().min(0).max(4),
  version: z.int().min(0),
});
export type StudentGroup = z.infer<typeof StudentGroupSchema>;

/** `GET /me/activities/:activityId/group/candidates`. */
export const GroupCandidatesSchema = z.strictObject({
  groupSize: GroupSizeSchema,
  /** `groupSize − 1` before the start; `groupSize − participants` after. */
  freeSlots: z.int().min(0).max(4),
  /** Eligible classmates (FR-005), by name. */
  candidates: z.array(GroupPersonSchema),
});
export type GroupCandidates = z.infer<typeof GroupCandidatesSchema>;

/** `GET /classes/:classId/activities/:activityId/attempts/:attemptId/group`. */
export const TeacherAttemptGroupSchema = z.strictObject({
  leaderId: UuidSchema,
  /** Leader first, then by `joinedAt`. */
  members: z.array(
    z.strictObject({ id: UuidSchema, name: z.string(), joinedAt: IsoDateTimeSchema, addedById: UuidSchema.nullable() }),
  ),
  /** By `occurredAt`; `actorId` null is the system settlement. */
  events: z.array(
    z.strictObject({
      kind: GroupEventKindSchema,
      reason: GroupEventReasonSchema.nullable(),
      actorId: UuidSchema.nullable(),
      fromId: UuidSchema,
      toId: UuidSchema,
      occurredAt: IsoDateTimeSchema,
    }),
  ),
  /** By question position, then revision. */
  saves: z.array(
    z.strictObject({
      questionId: UuidSchema,
      entries: z.array(
        z.strictObject({ studentId: UuidSchema, revision: z.int().min(1), savedAt: IsoDateTimeSchema }),
      ),
    }),
  ),
});
export type TeacherAttemptGroup = z.infer<typeof TeacherAttemptGroupSchema>;

/** `POST /me/activities/:activityId/group/members`; the server checks the group's free slots. */
export const AddGroupMembersRequestSchema = z.strictObject({
  memberIds: z.array(UuidSchema).min(1).max(4).refine(hasNoRepeats, "DUPLICATE_MEMBER"),
});
export type AddGroupMembersRequest = z.infer<typeof AddGroupMembersRequestSchema>;

/** `POST /me/activities/:activityId/group/editing`. */
export const GroupEditingRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("HAND"), toUserId: UuidSchema }),
  z.strictObject({ action: z.literal("TAKE_BACK") }),
  z.strictObject({ action: z.literal("RETURN") }),
]);
export type GroupEditingRequest = z.infer<typeof GroupEditingRequestSchema>;

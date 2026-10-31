import type { GroupEventKind, GroupEventReason } from "@repo/contracts";
import type { Tx } from "../../../platform/database/transaction";
import type { AuditService } from "../../audit/audit.service";
import { type GroupRoles, groupRoles } from "./group-roles";

/** A group attempt as stored, with the roles `groupRoles` derives from it (023 research U9). */
export interface GroupRow {
  attemptId: string;
  activityId: string;
  leaderId: string;
  editorId: string;
  version: number;
  roles: GroupRoles;
}

interface StoredGroup {
  activity_id: string;
  leader_user_id: string;
  editor_user_id: string;
  version: number;
  group_size: number | null;
  class_id: string;
  activity_status: string;
}

interface ParticipantRow {
  student_user_id: string;
  joined_at: Date;
  active: boolean;
  paused: boolean;
}

/**
 * The group of an attempt, null for an individual one. The caller holds the attempt `FOR UPDATE` when
 * it acts on the result. A participant is active with an ACTIVE enrollment in the class, and paused with
 * an open pause while the activity is ACTIVE (a close ends every pause, 016). Participants come in the
 * student view's order — join time, the owner first, then by name — so the fallback leader is the same
 * one every member reads.
 */
export async function readGroup(tx: Tx, attemptId: string): Promise<GroupRow | null> {
  const rows = await tx.$queryRaw<StoredGroup[]>`
    SELECT g.activity_id, g.leader_user_id, g.editor_user_id, g.version, ca.group_size, ca.class_id, ca.status::text AS activity_status
    FROM attempt_groups g
    JOIN class_activities ca ON ca.id = g.activity_id
    WHERE g.attempt_id = ${attemptId}::uuid`;
  const group = rows[0];
  if (!group || group.group_size === null) return null;
  const participants = await tx.$queryRaw<ParticipantRow[]>`
    SELECT p.student_user_id, p.joined_at,
           EXISTS (SELECT 1 FROM enrollments e
                   WHERE e.class_id = ${group.class_id}::uuid AND e.student_user_id = p.student_user_id AND e.status = 'ACTIVE') AS active,
           EXISTS (SELECT 1 FROM attempt_pauses ap
                   WHERE ap.attempt_id = p.attempt_id AND ap.student_user_id = p.student_user_id AND ap.released_at IS NULL) AS paused
    FROM attempt_participants p
    JOIN users u ON u.id = p.student_user_id
    WHERE p.attempt_id = ${attemptId}::uuid
    ORDER BY p.joined_at, (p.added_by_user_id IS NOT NULL), u.name, p.student_user_id`;
  const pausesCount = group.activity_status === "ACTIVE";
  return {
    attemptId,
    activityId: group.activity_id,
    leaderId: group.leader_user_id,
    editorId: group.editor_user_id,
    version: group.version,
    roles: groupRoles({
      leaderId: group.leader_user_id,
      editorId: group.editor_user_id,
      groupSize: group.group_size,
      participants: participants.map((row) => ({
        id: row.student_user_id,
        joinedAt: row.joined_at,
        active: row.active,
        paused: pausesCount && row.paused,
      })),
    }),
  };
}

export interface SettleGroupInput {
  activityId: string;
  /** The session student: only the group they take part in, and only while they have the class. */
  studentUserId: string;
  /** Server clock. */
  now: Date;
  requestId?: string | null;
}

/**
 * 023/FR-023 (research U9): persists what `groupRoles` derives — a leader who lost the class is replaced
 * by the first active member (`LEADER_CHANGED`, `ACCESS_LOST`), and an editor who is paused or lost the
 * class gives the editing to the effective leader (`EDITING_RESET`, `PAUSED` or `ACCESS_LOST`) — each with
 * one `attempt_group_events` row (actor SYSTEM) and its audit event, and the group's `version` bumped once
 * per change. Only an attempt IN_PROGRESS of an ACTIVE activity (a group is final after it). Under the
 * attempt's `FOR UPDATE`, so a second touch finds it settled and writes nothing. A paused editor who comes
 * back doesn't get the editing back: the settlement already moved it. Returns how many changes it wrote.
 */
export async function settleGroup(tx: Tx, audit: AuditService, input: SettleGroupInput): Promise<number> {
  const { activityId, studentUserId, now } = input;
  const attempts = await tx.$queryRaw<{ id: string }[]>`
    SELECT a.id
    FROM activity_attempts a
    JOIN attempt_participants p ON p.attempt_id = a.id AND p.student_user_id = ${studentUserId}::uuid
    JOIN attempt_groups g ON g.attempt_id = a.id
    JOIN class_activities ca ON ca.id = a.activity_id
    WHERE a.activity_id = ${activityId}::uuid AND a.status = 'IN_PROGRESS' AND ca.status = 'ACTIVE'
      AND EXISTS (SELECT 1 FROM enrollments e WHERE e.class_id = ca.class_id AND e.student_user_id = ${studentUserId}::uuid AND e.status = 'ACTIVE')
    FOR UPDATE OF a`;
  const attemptId = attempts[0]?.id;
  if (!attemptId) return 0;
  const group = await readGroup(tx, attemptId);
  if (!group?.roles.leaderId || !group.roles.editorId) return 0;
  const { leaderId, editorId, members } = group.roles;
  const changes: { kind: Extract<GroupEventKind, "LEADER_CHANGED" | "EDITING_RESET">; reason: GroupEventReason; from: string; to: string }[] = [];
  if (leaderId !== group.leaderId) changes.push({ kind: "LEADER_CHANGED", reason: "ACCESS_LOST", from: group.leaderId, to: leaderId });
  if (editorId !== group.editorId) {
    const stored = members.find((member) => member.id === group.editorId);
    changes.push({ kind: "EDITING_RESET", reason: stored?.active ? "PAUSED" : "ACCESS_LOST", from: group.editorId, to: editorId });
  }
  if (changes.length === 0) return 0;

  await tx.attemptGroup.update({
    where: { attemptId },
    data: { leaderUserId: leaderId, editorUserId: editorId, version: { increment: changes.length } },
  });
  for (const change of changes) {
    await tx.attemptGroupEvent.create({
      data: { attemptId, kind: change.kind, reason: change.reason, actorUserId: null, fromUserId: change.from, toUserId: change.to, occurredAt: now },
    });
    const event = { actorType: "SYSTEM", targetType: "ACTIVITY_ATTEMPT", targetId: attemptId, requestId: input.requestId ?? null } as const;
    const ids = { activityId, attemptId, fromUserId: change.from, toUserId: change.to };
    if (change.kind === "LEADER_CHANGED") {
      await audit.record(tx, { ...event, type: "activity_group.leader_changed", metadata: { ...ids, reason: change.reason } });
    } else {
      await audit.record(tx, { ...event, type: "activity_group.editing_changed", metadata: { ...ids, kind: change.kind, reason: change.reason } });
    }
  }
  return changes.length;
}

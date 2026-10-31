import type { GroupEventKind, GroupEventReason, TeacherAttemptGroup } from "@repo/contracts";

/** A group attempt's stored facts as `AttemptsReviewService.getGroup` loads them (023 data-model.md). */
export interface StoredAttemptGroup {
  leaderUserId: string;
  participants: { studentUserId: string; name: string; joinedAt: Date; addedByUserId: string | null }[];
  events: { kind: GroupEventKind; reason: GroupEventReason | null; actorUserId: string | null; fromUserId: string; toUserId: string; occurredAt: Date }[];
  saves: { questionId: string; revision: number; studentUserId: string; savedAt: Date }[];
  /** The activity's question ids in position order. */
  questionIds: string[];
}

/**
 * What the teacher sees of a group attempt (023/FR-020, SC-005), copied field by field: members leader first,
 * then by `joinedAt`; the editing events by time; per question (by position) each accepted save by revision.
 * Facts only — nothing here is a grade, a suggestion or a label (US6-5).
 */
export function toTeacherAttemptGroup(stored: StoredAttemptGroup): TeacherAttemptGroup {
  const byJoin = [...stored.participants].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime() || a.studentUserId.localeCompare(b.studentUserId));
  const members = [...byJoin.filter((row) => row.studentUserId === stored.leaderUserId), ...byJoin.filter((row) => row.studentUserId !== stored.leaderUserId)];
  const events = [...stored.events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  return {
    leaderId: stored.leaderUserId,
    members: members.map((row) => ({ id: row.studentUserId, name: row.name, joinedAt: row.joinedAt.toISOString(), addedById: row.addedByUserId })),
    events: events.map((event) => ({
      kind: event.kind,
      reason: event.reason,
      actorId: event.actorUserId,
      fromId: event.fromUserId,
      toId: event.toUserId,
      occurredAt: event.occurredAt.toISOString(),
    })),
    saves: stored.questionIds
      .map((questionId) => ({
        questionId,
        entries: stored.saves
          .filter((save) => save.questionId === questionId)
          .sort((a, b) => a.revision - b.revision)
          .map((save) => ({ studentId: save.studentUserId, revision: save.revision, savedAt: save.savedAt.toISOString() })),
      }))
      .filter((question) => question.entries.length > 0),
  };
}

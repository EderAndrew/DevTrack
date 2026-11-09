import type { ActivityStatus, ExamNudgeStatus } from "@repo/contracts";
import { type PauseFacts, pauseTime } from "../activities/status/pause-time";

/**
 * The discreet warning's derivations (025 research N6, data-model "Derived"), with the server's `now`; nothing
 * here is stored. One derivation for the three readers — `exam-nudges`, the exam monitor (`exam-sessions`) and
 * the timeline (`attempt-integrity`) — so the web, the app and the server agree (SC-005). Pure: no Prisma, no Nest.
 */

/** The bell lights up from the 2nd counted occurrence (FR-001). */
export const MIN_OCCURRENCES_FOR_NUDGE = 2;

/** What the derivations read of the attempt, together with its warnings. */
export interface NudgeAttemptFacts {
  attemptStatus: "IN_PROGRESS" | "SUBMITTED";
  /** The submission's `submitted_at`, null without one. */
  submittedAt: Date | null;
  /** An `exam_attempt_holds` row with no resolution. */
  holdOpen: boolean;
  /** The attempt's latest pause not released by the teacher, if any (its end may still come by derivation). */
  openPause: PauseFacts | null;
  /** The attempt's end, ready (018 `exam-time` `endsAt`, already capped by the activity's close). */
  endsAt: Date;
  activityStatus: ActivityStatus;
  /** The activity's `closed_at` or `cancelled_at`, null while ACTIVE. */
  activityEndedAt: Date | null;
  /** `max(ordinal)` of the attempt's `exam_occurrences`, 0 without any. */
  occurrenceCount: number;
}

/** A warning as stored. */
export interface NudgeFacts {
  sentAt: Date;
  dismissedAt: Date | null;
}

/** The attempt ended: submitted, out of time or its activity closed or cancelled (what leaves a warning UNSEEN). */
function ended(facts: NudgeAttemptFacts, now: Date): boolean {
  return facts.attemptStatus !== "IN_PROGRESS" || facts.submittedAt !== null || now >= facts.endsAt || facts.activityStatus !== "ACTIVE";
}

/** A pause still open: not released and not ended by derivation (016 `pauseTime`). */
function paused(facts: NudgeAttemptFacts, now: Date): boolean {
  if (!facts.openPause) return false;
  const time = pauseTime(facts.openPause, { acceptedAt: facts.submittedAt, activityEndedAt: facts.activityEndedAt, examEndsAt: facts.endsAt }, now);
  return time.endedAt === null;
}

/** In progress, not submitted, not held, not paused, before its end and with the activity ACTIVE. */
export function running(facts: NudgeAttemptFacts, now: Date): boolean {
  return !ended(facts, now) && !facts.holdOpen && !paused(facts, now);
}

/** The bell is enabled: the attempt runs, it has 2+ counted occurrences and no warning is pending (FR-001, FR-003). */
export function canSendNudge(facts: NudgeAttemptFacts, latest: NudgeFacts | null, now: Date): boolean {
  return running(facts, now) && facts.occurrenceCount >= MIN_OCCURRENCES_FOR_NUDGE && !(latest && latest.dismissedAt === null);
}

/** The student sees the warning only while it is pending and the attempt runs (FR-010; it shows again after a return). */
export function nudgeShown(nudge: NudgeFacts, facts: NudgeAttemptFacts, now: Date): boolean {
  return nudge.dismissedAt === null && running(facts, now);
}

/** What the teacher reads: closed by the student, not seen (the attempt ended with it pending) or pending (FR-012, FR-015). */
export function nudgeStatus(nudge: NudgeFacts, facts: NudgeAttemptFacts, now: Date): ExamNudgeStatus {
  if (nudge.dismissedAt !== null) return "DISMISSED";
  if (ended(facts, now)) return "UNSEEN";
  return "PENDING";
}

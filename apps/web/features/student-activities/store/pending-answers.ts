import { type Answer, AnswerSchema } from "@repo/contracts";
import { z } from "zod";

// Unsent answers of the answering screen, kept in this browser until the server confirms them
// (012/FR-019, research P22). The server stays the authority: this copy only replays what the tab
// had not sent yet, with the revision it last saw. Every access is wrapped in try/catch, so a
// browser without storage (private mode, blocked site data, full quota) keeps working on screen.

/** One key per student and activity (the activity's single attempt). */
export const PENDING_ANSWERS_PREFIX = "devtrack:respostas:";

export interface PendingAnswer {
  questionId: string;
  answer: Answer;
  baseRevision: number;
}

const StoredSchema = z.array(
  z.object({ questionId: z.string().min(1), answer: AnswerSchema, baseRevision: z.int().min(0) }),
);

const keyOf = (userId: string, activityId: string) => `${PENDING_ANSWERS_PREFIX}${userId}:${activityId}`;

/** The unsent answers of this student and activity; nothing when the storage is missing or the value is not ours. */
export function readPendingAnswers(userId: string, activityId: string): PendingAnswer[] {
  try {
    const raw = window.localStorage.getItem(keyOf(userId, activityId));
    if (raw === null) return [];
    const parsed = StoredSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Replaces the unsent answers; an empty list removes the key. */
export function writePendingAnswers(userId: string, activityId: string, answers: readonly PendingAnswer[]): void {
  try {
    if (answers.length === 0) window.localStorage.removeItem(keyOf(userId, activityId));
    else window.localStorage.setItem(keyOf(userId, activityId), JSON.stringify(answers));
  } catch {
    // No storage: the answers stay on screen and in memory.
  }
}

/** After a successful submission. */
export function clearPendingAnswers(userId: string, activityId: string): void {
  writePendingAnswers(userId, activityId, []);
}

/** On logout: every `devtrack:respostas:` key of this browser, whoever wrote it (FR-019). */
export function clearAllPendingAnswers(): void {
  try {
    const storage = window.localStorage;
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(PENDING_ANSWERS_PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Nothing to clear without storage.
  }
}

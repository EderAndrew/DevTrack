import { FeedbackStatusSchema, type FeedbackStatus } from "@repo/contracts";

// The states of a feedback (020 data-model.md, research J5). The database enforces the same
// transitions by trigger; this is what the API decides with. RESOLVED ↔ ARCHIVED goes through
// IN_REVIEW on purpose, so the history shows the reopening.

const TRANSITIONS: Readonly<Record<FeedbackStatus, readonly FeedbackStatus[]>> = {
  RECEIVED: ["IN_REVIEW", "RESOLVED", "ARCHIVED"],
  IN_REVIEW: ["RESOLVED", "ARCHIVED"],
  RESOLVED: ["IN_REVIEW"],
  ARCHIVED: ["IN_REVIEW"],
};

export const canTransition = (from: FeedbackStatus, to: FeedbackStatus): boolean => TRANSITIONS[from].includes(to);

/** The statuses an ADMIN can move `from` to, in the enum's order. */
export const allowedTransitions = (from: FeedbackStatus): FeedbackStatus[] =>
  FeedbackStatusSchema.options.filter((to) => canTransition(from, to));

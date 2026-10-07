import { z } from "zod";

// The AI help of a work (015 data-model.md, research F10, F11).

/**
 * A help request: `REQUESTED` until the execution ends, then once and for all DELIVERED (the
 * orientation reached the student: one help used), OUT_OF_SCOPE (the model refused), BLOCKED (the
 * leak check refused the orientation) or FAILED (the execution did not complete). Only DELIVERED
 * uses a help.
 */
export const WorkHelpStatusSchema = z.enum(["REQUESTED", "DELIVERED", "OUT_OF_SCOPE", "BLOCKED", "FAILED"]);
export type WorkHelpStatus = z.infer<typeof WorkHelpStatusSchema>;

/** Why the deterministic leak check blocked an orientation (research F10). */
export const WorkHelpBlockReasonSchema = z.enum(["MC_ALTERNATIVE_REFERENCED", "EXPECTED_ANSWER_OVERLAP", "SOLUTION_OVERLAP"]);
export type WorkHelpBlockReason = z.infer<typeof WorkHelpBlockReasonSchema>;

/** Why the AI help can't be turned on or served now (`GET /work-help/availability`). */
export const WorkHelpUnavailableReasonSchema = z.enum(["AGENT_DISABLED", "MODEL_UNAVAILABLE"]);
export type WorkHelpUnavailableReason = z.infer<typeof WorkHelpUnavailableReasonSchema>;

/** What the `work-helper` answers (contracts/work-helper.md). */
export const WorkHelperOutcomeSchema = z.enum(["GUIDANCE", "OUT_OF_SCOPE"]);
export type WorkHelperOutcome = z.infer<typeof WorkHelperOutcomeSchema>;

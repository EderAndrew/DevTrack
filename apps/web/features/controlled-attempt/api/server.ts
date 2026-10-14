import type { StudentActivity } from "@repo/contracts";
import { ApiError } from "@/lib/api/client";
import { serverGet } from "@/lib/api/server";

/**
 * Which focus page fits the activity (015 research F14): the controlled work's, for a CONTROLLED work
 * with an attempt, and since 018 the exam's (`features/exam-attempt`). Anything else (NORMAL, not
 * started, out of context, a failure) is null and goes back to the activity's page, where the API's
 * answer is shown. Imported by `app/` only (uses next/headers).
 */
export async function focusPageOf(activityId: string): Promise<"EXAM" | "CONTROLLED" | null> {
  try {
    const activity = await serverGet<StudentActivity>(`/me/activities/${activityId}`);
    if (activity === null || activity.executionMode !== "CONTROLLED" || activity.attempt === null) return null;
    return activity.type === "EXAM" ? "EXAM" : "CONTROLLED";
  } catch (error) {
    if (error instanceof ApiError) return null;
    throw error;
  }
}

import type { StudentActivity } from "@repo/contracts";
import { ApiError } from "@/lib/api/client";
import { serverGet } from "@/lib/api/server";

/**
 * Whether the focus page fits the activity (015 research F14): a CONTROLLED work with an attempt.
 * Anything else (NORMAL, not started, out of context, a failure) goes back to the activity's page,
 * where the API's answer is shown. Imported by `app/` only (uses next/headers).
 */
export async function answersInFocus(activityId: string): Promise<boolean> {
  try {
    const activity = await serverGet<StudentActivity>(`/me/activities/${activityId}`);
    return activity !== null && activity.executionMode === "CONTROLLED" && activity.attempt !== null;
  } catch (error) {
    if (error instanceof ApiError) return false;
    throw error;
  }
}

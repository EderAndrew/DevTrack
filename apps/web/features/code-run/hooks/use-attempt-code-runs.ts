"use client";

import { useQuery } from "@tanstack/react-query";
import { codeRunReviewApi } from "../api/code-runs";

/**
 * 021/US3: the runs of one attempt, read on every opening of the review (FR-014). Every CODE question
 * of the attempt shares this query, so the page asks once.
 */
export const useAttemptCodeRuns = (classId: string, activityId: string, attemptId: string) =>
  useQuery({
    queryKey: ["classes", classId, "activities", activityId, "attempts", attemptId, "code-runs"],
    queryFn: () => codeRunReviewApi.summary(classId, activityId, attemptId),
  });

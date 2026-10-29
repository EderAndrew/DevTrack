import type { AttemptCodeRunSummary, CodeRun, CodeRunnerAvailability, LatestCodeRun } from "@repo/contracts";
import { ApiError, apiClient } from "@/lib/api/client";

const questionPath = (activityId: string, questionId: string) => `/me/activities/${activityId}/questions/${questionId}/code-runs`;

/** The session student's code runs (019 contracts/http-api.md, "Student: runs"). */
export const codeRunsApi = {
  /** 202 with the new run; 200 with the student's pending run, which may be of another question. */
  create: (activityId: string, questionId: string, sourceCode: string) => apiClient.post<CodeRun>(questionPath(activityId, questionId), { sourceCode }),
  latest: (activityId: string, questionId: string) => apiClient.get<LatestCodeRun>(`${questionPath(activityId, questionId)}/latest`),
  get: (runId: string) => apiClient.get<CodeRun>(`/me/code-runs/${runId}`),
};

/** 021 research Y3: whether the Code Runner can run now, for the teacher applying a work. */
export const codeRunnerApi = {
  availability: () => apiClient.get<CodeRunnerAvailability>("/code-runner/availability"),
};

/** 021 research Y7: the teacher's summary of a student's runs in a work (counts and verdicts, no content). */
export const codeRunReviewApi = {
  summary: (classId: string, activityId: string, attemptId: string) =>
    apiClient.get<AttemptCodeRunSummary>(`/classes/${classId}/activities/${activityId}/attempts/${attemptId}/code-runs`),
};

/** The seconds of `Retry-After` of a `429 RATE_LIMITED`, or null for any other failure. */
export const retryAfterSecondsOf = (error: unknown): number | null =>
  error instanceof ApiError && error.code === "RATE_LIMITED" ? (error.retryAfterSeconds ?? null) : null;

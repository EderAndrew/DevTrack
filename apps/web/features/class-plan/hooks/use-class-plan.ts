"use client";

import type { ClassPlanEnvelope, ClassPlanView, TopicFields } from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { classMeetingsKeys } from "@/features/class-calendar/hooks/use-class-meetings";
import { classesKeys } from "@/features/classes/hooks/use-classes";
import { classPlanApi } from "../api/class-plan";

/** `["classes", id, "plan"]`, shared with the calendar, and the coverage under it. */
export const classPlanKeys = {
  plan: classMeetingsKeys.plan,
  coverage: (classId: string) => [...classMeetingsKeys.plan(classId), "coverage"] as const,
};

/** `{plan: null}` until the class selects a confirmed syllabus. */
export const useClassPlan = (classId: string, options: { enabled?: boolean } = {}) =>
  useQuery({ queryKey: classPlanKeys.plan(classId), queryFn: () => classPlanApi.get(classId), enabled: options.enabled });

/** Items of the syllabus in use with the topics that cover them (FR-040); only once there is a plan. */
export const useClassPlanCoverage = (classId: string, enabled: boolean) =>
  useQuery({ queryKey: classPlanKeys.coverage(classId), queryFn: () => classPlanApi.coverage(classId), enabled });

/**
 * A plan write (research E13): sends the `revision` of the plan in the cache as `planRevision`,
 * then stores the `ClassPlanView` the API answers with. Coverage and the calendar's topic counts
 * come from other queries, so they are fetched again.
 */
function usePlanWrite<TInput>(
  classId: string,
  request: (input: TInput, planRevision: number | null) => Promise<ClassPlanView>,
  after: (queryClient: ReturnType<typeof useQueryClient>) => Promise<unknown> = async () => undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) =>
      request(input, queryClient.getQueryData<ClassPlanEnvelope>(classPlanKeys.plan(classId))?.plan?.revision ?? null),
    onSuccess: async (plan) => {
      queryClient.setQueryData<ClassPlanEnvelope>(classPlanKeys.plan(classId), { plan });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: classPlanKeys.coverage(classId) }),
        queryClient.invalidateQueries({ queryKey: classMeetingsKeys.meetings(classId) }),
        after(queryClient),
      ]);
    },
  });
}

/** Selects (or switches) the confirmed syllabus revision the class uses; the class shows the plan status. */
export const useSelectPlanSyllabus = (classId: string) =>
  usePlanWrite(
    classId,
    (revisionId: string, planRevision) => classPlanApi.selectSyllabus(classId, { planRevision, revisionId }),
    (queryClient) => queryClient.invalidateQueries({ queryKey: classesKeys.detail(classId), exact: true }),
  );

export const useCreateTopic = (classId: string) =>
  usePlanWrite(classId, (fields: TopicFields, planRevision) =>
    // The form only opens on a plan, so the cache has its revision.
    classPlanApi.createTopic(classId, { planRevision: planRevision ?? 0, ...fields }),
  );

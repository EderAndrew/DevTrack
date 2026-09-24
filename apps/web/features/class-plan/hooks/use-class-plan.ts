"use client";

import type {
  ClassPlanEnvelope,
  ClassPlanView,
  PlanStatusAction,
  ReorderTopicsRequest,
  TopicFields,
  UpdateTopicRequest,
} from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { classMeetingsKeys } from "@/features/class-calendar/hooks/use-class-meetings";
import { classesKeys } from "@/features/classes/hooks/use-classes";
import { classPlanApi } from "../api/class-plan";

/** `["classes", id, "plan"]`, shared with the calendar, and the coverage under it. */
export const classPlanKeys = {
  plan: classMeetingsKeys.plan,
  coverage: (classId: string) => [...classMeetingsKeys.plan(classId), "coverage"] as const,
  archived: (classId: string) => [...classMeetingsKeys.plan(classId), "archived"] as const,
};

/** The cache always holds a plan when a topic action is offered. */
const current = (planRevision: number | null) => planRevision ?? 0;

/** `{plan: null}` until the class selects a confirmed syllabus. */
export const useClassPlan = (classId: string, options: { enabled?: boolean } = {}) =>
  useQuery({ queryKey: classPlanKeys.plan(classId), queryFn: () => classPlanApi.get(classId), enabled: options.enabled });

/** Items of the syllabus in use with the topics that cover them (FR-040); only once there is a plan. */
export const useClassPlanCoverage = (classId: string, enabled: boolean) =>
  useQuery({ queryKey: classPlanKeys.coverage(classId), queryFn: () => classPlanApi.coverage(classId), enabled });

/** "Tópicos arquivados" (FR-038); only fetched while the plan has some. */
export const useArchivedTopics = (classId: string, enabled: boolean) =>
  useQuery({ queryKey: classPlanKeys.archived(classId), queryFn: () => classPlanApi.archivedTopics(classId), enabled });

/** Fetches the plan again: after a 409 PLAN_REVISION_CONFLICT, "Atualizar" keeps the open form. */
export function useRefreshPlan(classId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: classPlanKeys.plan(classId) });
}

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
        queryClient.invalidateQueries({ queryKey: classPlanKeys.archived(classId) }),
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
    classPlanApi.createTopic(classId, { planRevision: current(planRevision), ...fields }),
  );

export const useUpdateTopic = (classId: string) =>
  usePlanWrite(classId, ({ topicId, fields }: { topicId: string; fields: Omit<UpdateTopicRequest, "planRevision"> }, planRevision) =>
    classPlanApi.updateTopic(classId, topicId, { planRevision: current(planRevision), ...fields } as UpdateTopicRequest),
  );

/** The first id stays and receives the fields (FR-036). */
export const useMergeTopics = (classId: string) =>
  usePlanWrite(classId, ({ topicIds, fields }: { topicIds: string[]; fields: TopicFields }, planRevision) =>
    classPlanApi.mergeTopics(classId, { planRevision: current(planRevision), topicIds, ...fields }),
  );

/** The first part stays in the topic (FR-037). */
export const useSplitTopic = (classId: string) =>
  usePlanWrite(classId, ({ topicId, parts }: { topicId: string; parts: TopicFields[] }, planRevision) =>
    classPlanApi.splitTopic(classId, topicId, { planRevision: current(planRevision), parts }),
  );

export const useArchiveTopic = (classId: string) =>
  usePlanWrite(classId, (topicId: string, planRevision) => classPlanApi.archiveTopic(classId, topicId, current(planRevision)));

export const useRestoreTopic = (classId: string) =>
  usePlanWrite(classId, (topicId: string, planRevision) => classPlanApi.restoreTopic(classId, topicId, current(planRevision)));

/** Order and meetings of every non-archived topic in one write (FR-035). */
export const useReorderTopics = (classId: string) =>
  usePlanWrite(classId, (items: ReorderTopicsRequest["items"], planRevision) =>
    classPlanApi.reorderTopics(classId, { planRevision: current(planRevision), items }),
  );

/** Confirm, reopen, start or archive (FR-031); the class shows the plan status. */
export const useChangePlanStatus = (classId: string) =>
  usePlanWrite(
    classId,
    (action: PlanStatusAction, planRevision) => classPlanApi.changeStatus(classId, { planRevision: current(planRevision), action }),
    (queryClient) => queryClient.invalidateQueries({ queryKey: classesKeys.detail(classId), exact: true }),
  );

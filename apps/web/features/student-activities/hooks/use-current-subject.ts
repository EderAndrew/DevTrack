"use client";

import type { MyClassView } from "@repo/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { myClassesKeys, useMyClasses } from "@/features/my-classes/hooks/use-my-classes";
import { toApiError } from "../api/student-activities";
import { subjectOptions } from "../schemas/student-activity";

export interface CurrentSubject {
  /** "Minhas turmas" still loading: nothing of the activities is asked yet (026 research D6). */
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  /** The card's options, in the order of "Minhas turmas". */
  options: { id: string; label: string }[];
  /** The class shown; null without an ACTIVE enrollment (no card, the empty states of 012). */
  current: MyClassView | null;
  /** The address named a class the student can't see (any more): the first one is shown with the notice (FR-011). */
  unavailable: boolean;
  /** "Minhas turmas" is being asked again (after a `404` of the chosen class, US3-6). */
  isRefetching: boolean;
}

/**
 * Which subject the Painel and "Minhas atividades" show (026 research D6): the `materia` of the address when it is one of
 * the student's classes, else the first of "Minhas turmas" (the most recent ACTIVE enrollment). Only the server decides
 * what the student may read; this only chooses a class the server already listed.
 */
export function useCurrentSubject(materia: string | null): CurrentSubject {
  const query = useMyClasses();
  const items = query.data?.items ?? [];
  const chosen = materia === null ? undefined : items.find((item) => item.id === materia);
  return {
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
    options: subjectOptions(items),
    current: chosen ?? items[0] ?? null,
    unavailable: materia !== null && items.length > 0 && chosen === undefined,
    isRefetching: query.isFetching && !query.isPending,
  };
}

/**
 * A `404` of the list or the dashboard for the chosen class means the enrollment ended while the page was open (026/US3-6,
 * research D6): "Minhas turmas" is asked again, the class drops out of it and the resolution above falls back to the first
 * one with the notice. The address is not rewritten (no redirect loop). True while that new list is on its way, so the
 * page waits instead of showing the failure.
 */
export function useForgetMissingSubject(subject: CurrentSubject, classId: string | null, error: unknown): boolean {
  const queryClient = useQueryClient();
  const missing = classId !== null && error != null && toApiError(error).status === 404;
  useEffect(() => {
    if (missing) void queryClient.invalidateQueries({ queryKey: myClassesKeys.list });
  }, [missing, classId, error, queryClient]);
  return missing && subject.isRefetching;
}

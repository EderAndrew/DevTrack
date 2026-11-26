"use client";

import { useQuery } from "@tanstack/react-query";
import { isNotFound, studentCalendarApi } from "../api/student-calendar";

/** Query keys: `["student-calendar", classId]`. */
export const studentCalendarKeys = {
  all: ["student-calendar"] as const,
  of: (classId: string) => [...studentCalendarKeys.all, classId] as const,
};

/**
 * The calendar of the current matéria (031/US3, research CK8): read when the Painel opens and again on focus, never
 * polled (FR-020: a teacher's save shows on the next read).
 */
export const useStudentCalendar = (classId: string) =>
  useQuery({
    queryKey: studentCalendarKeys.of(classId),
    queryFn: () => studentCalendarApi.get(classId),
  });

/** The calendar of a matéria the student no longer sees: the Painel's 026 fallback takes care of it. */
export const isCalendarGone = (error: unknown) => isNotFound(error);

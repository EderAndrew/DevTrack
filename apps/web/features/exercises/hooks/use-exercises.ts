"use client";

import type { CreateExerciseRequest, ExerciseSetRequest } from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { subjectsApi } from "@/features/subjects/api/subjects";
import { subjectsKeys } from "@/features/subjects/hooks/use-subjects";
import { syllabusDocumentsApi } from "@/features/syllabus/api/syllabus-documents";
import { syllabusKeys } from "@/features/syllabus/hooks/use-syllabus-documents";
import { exercisesApi, programmingLanguagesApi } from "../api/exercises";

export { useSyllabusRevision as useTopicRevision } from "@/features/syllabus/hooks/use-syllabus-revisions";

/** Query keys: `["exercises", …]` and `["programming-languages"]`. */
export const exercisesKeys = {
  all: ["exercises"] as const,
  detail: (id: string) => [...exercisesKeys.all, id] as const,
  languages: ["programming-languages"] as const,
};

/** The catalog changes only by migration: cached for the session. */
export const useProgrammingLanguages = () =>
  useQuery({ queryKey: exercisesKeys.languages, queryFn: programmingLanguagesApi.list, staleTime: Infinity });

/** Topic picker, step 1: the teacher's active subjects (first page, ordered by name). */
export const useTopicSubjects = () =>
  // Not `subjectsKeys.list`: that key holds the list page's infinite query.
  useQuery({ queryKey: [...subjectsKeys.all, "topic-picker"], queryFn: () => subjectsApi.list({ status: "ACTIVE" }) });

/** Topic picker, step 2: the subject's syllabus versions (the picker keeps the confirmed ones). */
export const useTopicSyllabi = (subjectId: string) =>
  useQuery({
    queryKey: syllabusKeys.subjectDocuments(subjectId),
    queryFn: () => syllabusDocumentsApi.list(subjectId),
    enabled: subjectId !== "",
  });

export function useCreateExerciseSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ExerciseSetRequest) => exercisesApi.createSet(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exercisesKeys.all }),
  });
}

export function useCreateExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateExerciseRequest) => exercisesApi.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exercisesKeys.all }),
  });
}

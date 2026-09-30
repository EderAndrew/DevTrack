"use client";

import type { CreateWorkRequest } from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { subjectsApi } from "@/features/subjects/api/subjects";
import { subjectsKeys } from "@/features/subjects/hooks/use-subjects";
import { syllabusDocumentsApi } from "@/features/syllabus/api/syllabus-documents";
import { syllabusKeys } from "@/features/syllabus/hooks/use-syllabus-documents";
import { worksApi } from "../api/works";

export { useSyllabusRevision as useWorkRevision } from "@/features/syllabus/hooks/use-syllabus-revisions";

/** Query keys: `["works", …]`. */
export const worksKeys = {
  all: ["works"] as const,
  detail: (id: string) => [...worksKeys.all, id] as const,
  languages: ["works", "programming-languages"] as const,
};

/** The catalog changes only by migration: cached for the session. */
export const useWorkLanguages = () =>
  useQuery({
    queryKey: worksKeys.languages,
    queryFn: worksApi.programmingLanguages,
    staleTime: Infinity,
  });

/** The work's subject: the teacher's active subjects (first page, ordered by name). */
export const useWorkSubjects = () =>
  // Not `subjectsKeys.list`: that key holds the list page's infinite query.
  useQuery({
    queryKey: [...subjectsKeys.all, "work-form"],
    queryFn: () => subjectsApi.list({ status: "ACTIVE" }),
  });

/** The subject's syllabus versions (the form keeps the confirmed ones). */
export const useWorkSyllabi = (subjectId: string) =>
  useQuery({
    queryKey: syllabusKeys.subjectDocuments(subjectId),
    queryFn: () => syllabusDocumentsApi.list(subjectId),
    enabled: subjectId !== "",
  });

export function useCreateWork() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWorkRequest) => worksApi.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: worksKeys.all }),
  });
}

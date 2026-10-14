"use client";

import type { CreateExamGenerationRequest, CreateExamRequest, ExamListQuery, TeacherExam, UpdateExamRequest } from "@repo/contracts";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { subjectsApi } from "@/features/subjects/api/subjects";
import { subjectsKeys } from "@/features/subjects/hooks/use-subjects";
import { syllabusDocumentsApi } from "@/features/syllabus/api/syllabus-documents";
import { syllabusKeys } from "@/features/syllabus/hooks/use-syllabus-documents";
import { examGenerationApi, examsApi, isExamVersionConflict } from "../api/exams";

export { isExamVersionConflict };

export { useSyllabusRevision as useExamRevision } from "@/features/syllabus/hooks/use-syllabus-revisions";

/** Query keys: `["exams", …]`. */
export const examsKeys = {
  all: ["exams"] as const,
  detail: (id: string) => [...examsKeys.all, id] as const,
  list: (filters: ExamFilters) => [...examsKeys.all, "list", filters] as const,
  languages: ["exams", "programming-languages"] as const,
  generationAvailability: ["exam-generation", "availability"] as const,
  generationRequest: (id: string) => ["exam-generation", "requests", id] as const,
};

/** How often a PENDING generation is read again until the draft is ready. */
export const EXAM_GENERATION_POLL_MS = 3000;

/** The exam's subject: the teacher's active subjects (first page, ordered by name). */
export const useExamSubjects = () => useQuery({ queryKey: [...subjectsKeys.all, "exam-form"], queryFn: () => subjectsApi.list({ status: "ACTIVE" }) });

/** The subject's syllabus versions (the form keeps the confirmed ones). */
export const useExamSyllabi = (subjectId: string) =>
  useQuery({ queryKey: syllabusKeys.subjectDocuments(subjectId), queryFn: () => syllabusDocumentsApi.list(subjectId), enabled: subjectId !== "" });

/** The active languages of the shared catalog; changed only by migration, cached for the session. */
export const useExamLanguages = () =>
  useQuery({ queryKey: examsKeys.languages, queryFn: examsApi.programmingLanguages, staleTime: Infinity });

export function useCreateExam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateExamRequest) => examsApi.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: examsKeys.all }),
  });
}

/** The bank's filters: the list query without the page. */
export type ExamFilters = Omit<ExamListQuery, "cursor" | "limit">;

/** The teacher's bank, most recently changed first, 20 at a time ("Carregar mais"). */
export const useExams = (filters: ExamFilters) =>
  useInfiniteQuery({
    queryKey: examsKeys.list(filters),
    queryFn: ({ pageParam }) => examsApi.list({ ...filters, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });

/** One of the teacher's exams, everything included (the teacher view). */
export const useExam = (id: string) => useQuery({ queryKey: examsKeys.detail(id), queryFn: () => examsApi.get(id) });

/** Save, approve, archive and restore: each answers the exam as it now is, which replaces the cached one. */
export function useExamActions(id: string) {
  const queryClient = useQueryClient();
  const onSuccess = (exam: TeacherExam) => {
    queryClient.setQueryData(examsKeys.detail(id), exam);
    void queryClient.invalidateQueries({ queryKey: examsKeys.all, predicate: (query) => query.queryKey[1] !== id });
  };
  return {
    update: useMutation({ mutationFn: (body: UpdateExamRequest) => examsApi.update(id, body), onSuccess }),
    approve: useMutation({ mutationFn: (version: number) => examsApi.approve(id, version), onSuccess }),
    archive: useMutation({ mutationFn: (version: number) => examsApi.archive(id, version), onSuccess }),
    restore: useMutation({ mutationFn: (version: number) => examsApi.restore(id, version), onSuccess }),
    /** A version conflict: the exam is read again, as it now is. */
    reload: () => queryClient.invalidateQueries({ queryKey: examsKeys.detail(id), exact: true }),
  };
}

/** Whether "Criar prova com IA" can take a request now (agent, model, processing). */
export const useExamGenerationAvailability = () =>
  useQuery({ queryKey: examsKeys.generationAvailability, queryFn: examGenerationApi.availability });

export const useRequestExamGeneration = () =>
  useMutation({ mutationFn: (body: CreateExamGenerationRequest) => examGenerationApi.request(body) });

/** One request, read again while PENDING; once GENERATED it names the DRAFT exam. */
export const useExamGenerationRequest = (id: string) =>
  useQuery({
    queryKey: examsKeys.generationRequest(id),
    queryFn: () => examGenerationApi.get(id),
    refetchInterval: (query) => (query.state.data?.status === "PENDING" ? EXAM_GENERATION_POLL_MS : false),
  });

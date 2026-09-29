import type {
  ApproveBatchExercisesRequest,
  CreateExerciseRequest,
  ExerciseBatchDetail,
  ExerciseBatchListQuery,
  ExerciseBatchPage,
  ExerciseBatchRequest,
  ExerciseBatchView,
  ExerciseGenerationAvailability,
  ExerciseListQuery,
  ExercisePage,
  ExerciseSet,
  ExerciseSetRequest,
  ExerciseTeacherView,
  ProgrammingLanguageList,
  UpdateExerciseRequest,
} from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** The teacher's exercise bank (010 contracts/http-api.md, "Exercises"). */
export const exercisesApi = {
  /** One page of the bank; empty filters are left out of the query string. */
  list: (query: ExerciseListQuery) => {
    const params = new URLSearchParams(Object.entries(query).flatMap(([key, value]) => (value === undefined || value === "" ? [] : [[key, String(value)]])));
    const search = params.toString();
    return apiClient.get<ExercisePage>(`/exercises${search ? `?${search}` : ""}`);
  },
  createSet: (body: ExerciseSetRequest) => apiClient.post<ExerciseSet>("/exercises/sets", body),
  create: (body: CreateExerciseRequest) => apiClient.post<ExerciseTeacherView>("/exercises", body),
  get: (id: string) => apiClient.get<ExerciseTeacherView>(`/exercises/${id}`),
  update: (id: string, body: UpdateExerciseRequest) => apiClient.put<ExerciseTeacherView>(`/exercises/${id}`, body),
  approve: (id: string, version: number) => apiClient.post<ExerciseTeacherView>(`/exercises/${id}/approve`, { version }),
  archive: (id: string, version: number) => apiClient.post<ExerciseTeacherView>(`/exercises/${id}/archive`, { version }),
  restore: (id: string, version: number) => apiClient.post<ExerciseTeacherView>(`/exercises/${id}/restore`, { version }),
  /** Only a DRAFT of a batch (US4-3). */
  remove: (id: string, version: number) => apiClient.delete<void>(`/exercises/${id}`, { version }),
};

/** "Criar com IA": generation batches (010 contracts/http-api.md, "Generation batches"). */
export const exerciseBatchesApi = {
  availability: () => apiClient.get<ExerciseGenerationAvailability>("/exercise-generation/availability"),
  request: (body: ExerciseBatchRequest) => apiClient.post<ExerciseBatchView>("/exercise-batches", body),
  list: ({ cursor }: ExerciseBatchListQuery) =>
    apiClient.get<ExerciseBatchPage>(`/exercise-batches${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
  get: (id: string) => apiClient.get<ExerciseBatchDetail>(`/exercise-batches/${id}`),
  approve: (id: string, body: ApproveBatchExercisesRequest) => apiClient.post<ExerciseSet>(`/exercise-batches/${id}/approve`, body),
};

/** The active programming languages, ordered by name (010 research X17). */
export const programmingLanguagesApi = {
  list: () => apiClient.get<ProgrammingLanguageList>("/programming-languages"),
};

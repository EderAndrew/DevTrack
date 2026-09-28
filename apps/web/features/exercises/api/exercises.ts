import type {
  CreateExerciseRequest,
  ExerciseBatchDetail,
  ExerciseBatchListQuery,
  ExerciseBatchPage,
  ExerciseBatchRequest,
  ExerciseBatchView,
  ExerciseGenerationAvailability,
  ExerciseSet,
  ExerciseSetRequest,
  ExerciseTeacherView,
  ProgrammingLanguageList,
} from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** The teacher's exercise bank (010 contracts/http-api.md, "Exercises"). */
export const exercisesApi = {
  createSet: (body: ExerciseSetRequest) => apiClient.post<ExerciseSet>("/exercises/sets", body),
  create: (body: CreateExerciseRequest) => apiClient.post<ExerciseTeacherView>("/exercises", body),
  get: (id: string) => apiClient.get<ExerciseTeacherView>(`/exercises/${id}`),
};

/** "Criar com IA": generation batches (010 contracts/http-api.md, "Generation batches"). */
export const exerciseBatchesApi = {
  availability: () => apiClient.get<ExerciseGenerationAvailability>("/exercise-generation/availability"),
  request: (body: ExerciseBatchRequest) => apiClient.post<ExerciseBatchView>("/exercise-batches", body),
  list: ({ cursor }: ExerciseBatchListQuery) =>
    apiClient.get<ExerciseBatchPage>(`/exercise-batches${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
  get: (id: string) => apiClient.get<ExerciseBatchDetail>(`/exercise-batches/${id}`),
};

/** The active programming languages, ordered by name (010 research X17). */
export const programmingLanguagesApi = {
  list: () => apiClient.get<ProgrammingLanguageList>("/programming-languages"),
};

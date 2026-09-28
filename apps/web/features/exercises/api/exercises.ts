import type {
  CreateExerciseRequest,
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

/** The active programming languages, ordered by name (010 research X17). */
export const programmingLanguagesApi = {
  list: () => apiClient.get<ProgrammingLanguageList>("/programming-languages"),
};

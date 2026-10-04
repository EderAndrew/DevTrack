import type { Browser } from "@playwright/test";
import { logIn } from "../fixtures/journeys.ts";
import { apiPost, seedStudentPortal, type StudentPortalSeed } from "./student-portal-seed.ts";

/** One approved exercise of each level (013/FR-002): Básico 15, Intermediário 30, Avançado 60. */
export const POINT_EXERCISES = [
  {
    type: "MULTIPLE_CHOICE",
    difficulty: "BASIC",
    statement: "Qual palavra cria um objeto em Java?",
    correct: "new",
    wrong: ["class", "static"],
  },
  {
    type: "OPEN_ANSWER",
    difficulty: "INTERMEDIATE",
    statement: "Explique para que serve um construtor.",
    expectedAnswer: "GABARITO-E2E-013 iniciar o estado do objeto.",
  },
  {
    type: "OPEN_ANSWER",
    difficulty: "ADVANCED",
    statement: "Compare sobrecarga e sobrescrita.",
    expectedAnswer: "GABARITO-E2E-013 assinaturas diferentes × mesma assinatura na subclasse.",
  },
] as const;

export interface ExercisePointsSeed extends StudentPortalSeed {
  exerciseIds: string[];
}

/**
 * 013: the 012 portal seed (teacher, class, student by invitation) plus the three exercises of
 * `POINT_EXERCISES`, APPROVED in the teacher's bank through the API, without a topic.
 */
export async function seedExercisePoints(browser: Browser): Promise<ExercisePointsSeed> {
  const seed = await seedStudentPortal(browser);
  const teacherPage = await (await browser.newContext()).newPage();
  await logIn(teacherPage, seed.teacher, "/disciplinas");
  const exerciseIds: string[] = [];
  for (const exercise of POINT_EXERCISES) {
    const common = { statement: exercise.statement, explanation: `Explicação: ${exercise.statement}`, difficulty: exercise.difficulty, cognitiveObjective: "UNDERSTAND", status: "APPROVED" };
    const body =
      exercise.type === "MULTIPLE_CHOICE"
        ? { type: exercise.type, ...common, alternatives: [{ text: exercise.correct, isCorrect: true }, ...exercise.wrong.map((text) => ({ text, isCorrect: false }))] }
        : { type: exercise.type, ...common, expectedAnswer: exercise.expectedAnswer };
    exerciseIds.push((await apiPost<{ id: string }>(teacherPage, "/exercises", body)).id);
  }
  await teacherPage.context().close();
  return { ...seed, exerciseIds };
}

/** The teacher applies the three exercises to the class through the API, published now; returns the activity id. */
export async function applyExercisesThroughApi(browser: Browser, seed: ExercisePointsSeed, title: string): Promise<string> {
  const teacherPage = await (await browser.newContext()).newPage();
  await logIn(teacherPage, seed.teacher, "/disciplinas");
  const activity = await apiPost<{ id: string }>(teacherPage, `/classes/${seed.classId}/activities`, {
    idempotencyKey: crypto.randomUUID(),
    source: { type: "EXERCISE", exerciseIds: seed.exerciseIds },
    title,
    publishAt: null,
    acknowledgeOutOfScope: true,
  });
  await teacherPage.context().close();
  return activity.id;
}

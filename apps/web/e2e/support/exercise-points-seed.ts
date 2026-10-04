import { createRequire } from "node:module";
import type { Browser } from "@playwright/test";
import { API_DIR, assertE2eDatabase, e2eEnv } from "../env.ts";
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

/** 014: a Código exercise in Java (colored) and one in Go, whose grammar the E2E database removes. */
export const CODE_EXERCISES = {
  java: {
    statement: "Escreva a classe Conta em Java.",
    starterCode: "class Conta {\n}",
    expectedSolution: 'class Conta {\n  private double saldo = 0; // em reais\n  String dono = "Ana";\n}',
  },
  plain: {
    statement: "Escreva a função main em Go.",
    starterCode: "package main",
    expectedSolution: 'package main\n\nfunc main() { println("ok") }',
  },
} as const;

export interface CodeExercisesSeed extends ExercisePointsSeed {
  javaExerciseId: string;
  plainExerciseId: string;
}

/**
 * 014/SC-001: the language with no grammar is the catalog's Go with `highlight` set to NULL in the
 * E2E database only (every seeded language has a grammar). Goes straight to `devtrack_e2e`.
 */
async function removeGoGrammar(): Promise<void> {
  assertE2eDatabase();
  type PgClient = { connect(): Promise<void>; query(sql: string): Promise<unknown>; end(): Promise<void> };
  // The API's `pg` (the web has none): loaded from apps/api, typed by what is used here.
  const { Client } = createRequire(`${API_DIR}package.json`)("pg") as { Client: new (options: { connectionString?: string }) => PgClient };
  const client = new Client({ connectionString: e2eEnv.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`UPDATE "programming_languages" SET "highlight" = NULL WHERE "key" = 'go'`);
  } finally {
    await client.end();
  }
}

/** 014: the 013 seed plus the two Código exercises of `CODE_EXERCISES`, APPROVED in the teacher's bank. */
export async function seedCodeExercises(browser: Browser): Promise<CodeExercisesSeed> {
  const seed = await seedExercisePoints(browser);
  await removeGoGrammar();
  const teacherPage = await (await browser.newContext()).newPage();
  await logIn(teacherPage, seed.teacher, "/disciplinas");
  const languages = (await (await teacherPage.request.get("/api/programming-languages")).json()) as { id: string; key: string }[];
  const create = (exercise: (typeof CODE_EXERCISES)[keyof typeof CODE_EXERCISES], key: string) =>
    apiPost<{ id: string }>(teacherPage, "/exercises", {
      type: "CODE",
      statement: exercise.statement,
      explanation: `Explicação: ${exercise.statement}`,
      difficulty: "INTERMEDIATE",
      cognitiveObjective: "APPLY",
      status: "APPROVED",
      instructions: "Complete o código.",
      starterCode: exercise.starterCode,
      expectedSolution: exercise.expectedSolution,
      languageId: languages.find((language) => language.key === key)!.id,
    });
  const java = await create(CODE_EXERCISES.java, "java");
  const plain = await create(CODE_EXERCISES.plain, "go");
  await teacherPage.context().close();
  return { ...seed, javaExerciseId: java.id, plainExerciseId: plain.id };
}

/** The teacher applies the three exercises to the class through the API, published now; returns the activity id. */
export async function applyExercisesThroughApi(
  browser: Browser,
  seed: ExercisePointsSeed,
  title: string,
  exerciseIds: readonly string[] = seed.exerciseIds,
): Promise<string> {
  const teacherPage = await (await browser.newContext()).newPage();
  await logIn(teacherPage, seed.teacher, "/disciplinas");
  const activity = await apiPost<{ id: string }>(teacherPage, `/classes/${seed.classId}/activities`, {
    idempotencyKey: crypto.randomUUID(),
    source: { type: "EXERCISE", exerciseIds },
    title,
    publishAt: null,
    acknowledgeOutOfScope: true,
  });
  await teacherPage.context().close();
  return activity.id;
}

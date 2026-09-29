import type { ExerciseDifficulty, GeneratedExercise, GeneratedExerciseBatch } from "@repo/contracts";

/** What a batch asks for, as the read tool returns it. */
export interface GenerationRequestShape {
  difficulty: ExerciseDifficulty;
  counts: { OPEN_ANSWER: number; MULTIPLE_CHOICE: number; CODE: number };
  trickQuestions: number;
  /** The language name the tool gives for code (e.g. "Java"). */
  language: string | null;
}

/**
 * A valid answer of `exercise-generator` for `request` (010 contracts/exercise-generator.md):
 * exactly the counts, the difficulty, the trick questions (the first multiple-choice ones) and
 * the language asked for, each exercise structurally valid and with its own statement. `marker`
 * goes into every text, so the scans can find it.
 */
export function validGeneratedBatch(request: GenerationRequestShape, marker = "Herança"): GeneratedExerciseBatch {
  const exercises: GeneratedExercise[] = [];
  const common = (n: number) => ({
    statement: `${marker}: enunciado ${n}`,
    explanation: `${marker}: explicação ${n}`,
    difficulty: request.difficulty,
    cognitiveObjective: "UNDERSTAND" as const,
  });
  let n = 0;
  for (let i = 0; i < request.counts.OPEN_ANSWER; i += 1) {
    n += 1;
    exercises.push({ type: "OPEN_ANSWER", ...common(n), expectedAnswer: `${marker}: resposta ${n}` });
  }
  for (let i = 0; i < request.counts.MULTIPLE_CHOICE; i += 1) {
    n += 1;
    exercises.push({
      type: "MULTIPLE_CHOICE",
      ...common(n),
      alternatives: [
        { text: `${marker}: correta ${n}`, isCorrect: true },
        { text: `${marker}: distrator A ${n}`, isCorrect: false },
        { text: `${marker}: distrator B ${n}`, isCorrect: false },
        { text: `${marker}: distrator C ${n}`, isCorrect: false },
      ],
      isTrickQuestion: i < request.trickQuestions,
    });
  }
  for (let i = 0; i < request.counts.CODE; i += 1) {
    n += 1;
    exercises.push({
      type: "CODE",
      ...common(n),
      instructions: `${marker}: implemente ${n}`,
      starterCode: i === 0 ? null : `class Exercicio${n} {}`,
      expectedSolution: `${marker}: class Solucao${n} {}`,
      language: request.language ?? "Java",
    });
  }
  return { exercises };
}

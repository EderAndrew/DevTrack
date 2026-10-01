import type { GeneratedWork, GeneratedWorkQuestion, WorkDifficulty } from "@repo/contracts";

/** What a work generation request asks for, as the read tool returns it. */
export interface WorkGenerationShape {
  difficulty: WorkDifficulty;
  counts: { OPEN_ANSWER: number; MULTIPLE_CHOICE: number; CODE: number };
  trickQuestions: number;
  /** The language name the tool gives for code (e.g. "Java"). */
  language: string | null;
  /** How many topics were selected: refs T1…Tn. */
  topicCount: number;
}

/**
 * The topic refs of the question at `index` of `total`: T(index+1), T(index+1+total) and
 * T(index+1+2·total) when they exist, so every selected topic is covered by exactly one question
 * and no question cites more than 3 (the request allows at most 3 × total topics).
 */
export function topicRefsFor(index: number, total: number, topicCount: number): string[] {
  const refs = [index, index + total, index + 2 * total].filter((position) => position < topicCount).map((position) => `T${position + 1}`);
  // More questions than topics: the extra ones cite the first topic again.
  return refs.length > 0 ? refs : [`T${(index % topicCount) + 1}`];
}

/**
 * A valid answer of `work-generator` for `request` (011 contracts/work-generator.md): exactly the
 * counts, the difficulty, the trick questions (the first multiple-choice ones), the language and
 * every topic covered, each question structurally valid, with its own statement and, for code, a
 * public and a private test case. `marker` goes into every text, so the scans can find it.
 */
export function validGeneratedWork(request: WorkGenerationShape, marker = "Herança"): GeneratedWork {
  const total = request.counts.OPEN_ANSWER + request.counts.MULTIPLE_CHOICE + request.counts.CODE;
  const questions: GeneratedWorkQuestion[] = [];
  const common = () => {
    const n = questions.length + 1;
    return {
      statement: `${marker}: enunciado ${n}`,
      explanation: `${marker}: explicação ${n}`,
      topicRefs: topicRefsFor(questions.length, total, request.topicCount),
      difficulty: request.difficulty,
    };
  };
  for (let i = 0; i < request.counts.OPEN_ANSWER; i += 1) {
    const base = common();
    questions.push({ type: "OPEN_ANSWER", ...base, expectedAnswer: `${marker}: resposta ${questions.length + 1}`, rubric: i === 0 ? null : `${marker}: rubrica` });
  }
  for (let i = 0; i < request.counts.MULTIPLE_CHOICE; i += 1) {
    const base = common();
    const n = questions.length + 1;
    questions.push({
      type: "MULTIPLE_CHOICE",
      ...base,
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
    const base = common();
    const n = questions.length + 1;
    questions.push({
      type: "CODE",
      ...base,
      instructions: `${marker}: implemente ${n}`,
      starterCode: i === 0 ? null : `class Trabalho${n} {}`,
      expectedSolution: `${marker}: class Solucao${n} {}`,
      language: request.language ?? "Java",
      testCases: [
        { input: `${n}`, expectedOutput: `${marker}: saída pública ${n}`, visibility: "PUBLIC" },
        { input: `${n + 1}`, expectedOutput: `${marker}: saída privada ${n}`, visibility: "PRIVATE" },
      ],
    });
  }
  return { questions };
}

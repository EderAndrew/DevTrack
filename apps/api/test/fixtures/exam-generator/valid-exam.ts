import type { GeneratedExam, GeneratedExamQuestion, WorkDifficulty } from "@repo/contracts";

/** What an exam generation request asks for, as the read tool returns it. */
export interface ExamGenerationShape {
  difficulty: WorkDifficulty;
  counts: { OPEN_ANSWER: number; MULTIPLE_CHOICE: number; CODE: number };
  /** How many of the multiple-choice questions are trick questions (at most the request's). */
  trickCount: number;
  /** The request's language id, for code. */
  languageId: string | null;
  /** The chosen topics' ids, in order. */
  topicIds: readonly string[];
}

/**
 * The topic ids of the question at `index` of `total`: the topics at index, index + total and
 * index + 2·total when they exist, so every chosen topic is covered and no question cites more than 3.
 */
export function topicIdsFor(index: number, total: number, topicIds: readonly string[]): string[] {
  const ids = [index, index + total, index + 2 * total].filter((position) => position < topicIds.length).map((position) => topicIds[position]!);
  // More questions than topics: the extra ones cite a topic again.
  return ids.length > 0 ? ids : [topicIds[index % topicIds.length]!];
}

/**
 * A valid answer of `exam-generator` for `request` (018 contracts/exam-generator.md): exactly the
 * counts, the difficulty, the trick questions (the first multiple-choice ones), the language and every
 * topic covered, each question structurally valid with its own statement and, for code, a public and
 * a private test case. `marker` goes into every text, so the scans can find it.
 */
export function validGeneratedExam(request: ExamGenerationShape, marker = "Herança"): GeneratedExam {
  const total = request.counts.OPEN_ANSWER + request.counts.MULTIPLE_CHOICE + request.counts.CODE;
  const questions: GeneratedExamQuestion[] = [];
  const common = () => {
    const n = questions.length + 1;
    return {
      statement: `${marker}: enunciado da prova ${n}`,
      explanation: n === 1 ? null : `${marker}: explicação ${n}`,
      difficulty: request.difficulty,
      topicIds: topicIdsFor(questions.length, total, request.topicIds),
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
      alternatives: [`${marker}: distrator A ${n}`, `${marker}: correta ${n}`, `${marker}: distrator B ${n}`, `${marker}: distrator C ${n}`],
      correctIndex: 1,
      isTrickQuestion: i < request.trickCount,
    });
  }
  for (let i = 0; i < request.counts.CODE; i += 1) {
    const base = common();
    const n = questions.length + 1;
    questions.push({
      type: "CODE",
      ...base,
      languageId: request.languageId ?? "00000000-0000-4000-8000-000000000000",
      instructions: `${marker}: implemente ${n}`,
      starterCode: i === 0 ? null : `class Prova${n} {}`,
      expectedSolution: `${marker}: class Solucao${n} {}`,
      testCases: [
        { input: `${n}`, expectedOutput: `${marker}: saída pública ${n}`, visibility: "PUBLIC" },
        { input: `${n + 1}`, expectedOutput: `${marker}: saída privada ${n}`, visibility: "PRIVATE" },
      ],
    });
  }
  return { title: `${marker}: prova`, questions };
}

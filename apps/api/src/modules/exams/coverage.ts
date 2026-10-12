import { centsToGrade, type ExamCoverage, type GradeCents, type WorkDifficulty, WorkDifficultySchema } from "@repo/contracts";

/**
 * What an approved exam covers before it is applied (018 research T15, constitution XXIII): questions
 * and points per topic, flagged when outside the class's taught scope, and per difficulty. Pure and in
 * integer hundredths (011 W3). A question on two topics counts, with its whole value, in each of them,
 * so the topics' points may add up to more than the grade; the difficulties add up to it exactly.
 */

export interface CoverageQuestion {
  valueCents: GradeCents;
  difficulty: WorkDifficulty | null;
  topicIds: readonly string[];
}

export interface CoverageTopic {
  syllabusItemId: string;
  title: string;
}

/**
 * `topics` in the exam's order. `taughtScope` is the class's taught items, or null when the class has
 * no plan: then nothing is known to be taught and every topic is flagged (012 FR-005a).
 */
export function examCoverage(
  questions: readonly CoverageQuestion[],
  topics: readonly CoverageTopic[],
  taughtScope: ReadonlySet<string> | null,
): ExamCoverage {
  const byTopic = topics.map((topic) => {
    const assessing = questions.filter((question) => question.topicIds.includes(topic.syllabusItemId));
    return {
      syllabusItemId: topic.syllabusItemId,
      title: topic.title,
      questions: assessing.length,
      points: centsToGrade(assessing.reduce((sum, question) => sum + question.valueCents, 0)),
      outOfScope: taughtScope === null || !taughtScope.has(topic.syllabusItemId),
    };
  });
  const byDifficulty = WorkDifficultySchema.options.map((difficulty) => {
    const ofDifficulty = questions.filter((question) => question.difficulty === difficulty);
    return {
      difficulty,
      questions: ofDifficulty.length,
      points: centsToGrade(ofDifficulty.reduce((sum, question) => sum + question.valueCents, 0)),
    };
  });
  return { byTopic, byDifficulty };
}

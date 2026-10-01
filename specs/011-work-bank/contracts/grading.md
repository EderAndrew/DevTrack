# Contract: grading strategies and the student-grade rule (domain, used by 012)

Research W7. Pure code in `apps/api/src/modules/works/grading/`, with the result shapes in
`packages/contracts/src/works/grading.ts`. No route, no table, no model call in 011 (FR-042);
012 MUST call these functions and MUST NOT redefine them.

## Strategy per type (stored on the question)

| Type | `grading_strategy` | Decides | Nature of the result |
|------|--------------------|---------|----------------------|
| `MULTIPLE_CHOICE` | `EXACT_MATCH` | the server compares the chosen alternative id with the correct one | `RULE_RESULT`, final |
| `CODE` | `TEST_CASES` | the Code Runner runs every test case (spec of its own) | `RULE_RESULT`, final |
| `OPEN_ANSWER` | `AI_REVIEW` | the WorkEvaluationAgent (012) suggests; the teacher decides | `SUGGESTION` → `HUMAN_DECISION` |

The dispatcher looks the strategy up in a registry by `grading_strategy`; there is no
`switch (type)` (FR-036). A new strategy is a new registry entry.

## Shapes

```ts
type GradeCents = number            // integer hundredths (research W3)

type Answer =
  | { kind: "ALTERNATIVE", alternativeId: uuid | null }        // null = blank
  | { kind: "CODE", source: string }
  | { kind: "TEXT", text: string }

interface CodeRunnerPort {                                     // implemented by the Code Runner spec
  run(input: { languageKey: string, source: string,
               testCases: { input: string, expectedOutput: string }[] }):
    Promise<{ status: "PASSED" | "FAILED" | "UNAVAILABLE" | "INFRA_ERROR" }>
}
// 011 ships only UnavailableCodeRunner (always UNAVAILABLE).

type AiReviewOutcome =                                         // produced by 012's WorkEvaluationAgent
  | { kind: "SUGGESTED", suggestedCents: GradeCents, justification: string,
      feedback: string, confidence: number }
  | { kind: "FAILED" }                                         // unavailable, invalid output, timeout

type QuestionGrading = {
  questionId, strategy, valueCents: GradeCents,
  status: "GRADED" | "SUGGESTED" | "PENDING_TEACHER" | "DECIDED",
  nature: "RULE_RESULT" | "SUGGESTION" | "HUMAN_DECISION" | null,
  suggestedCents: GradeCents | null, teacherCents: GradeCents | null,
  finalCents: GradeCents | null,
  pendingReason: "CODE_RUNNER_UNAVAILABLE" | "CODE_RUNNER_INFRA_ERROR" | "NO_TEST_CASES"
               | "AI_REVIEW_FAILED" | "AI_REVIEW_OUT_OF_RANGE" | null
}

type WorkGrade = { cents: GradeCents, partial: boolean }
```

## Rules

| Function | Rule | Spec |
|----------|------|------|
| `exactMatch.grade(q, answer)` | correct id → `finalCents = value`; other id or blank → 0; `GRADED`, `RULE_RESULT`; no port | FR-037, US8-1/2 |
| `testCases.grade(q, answer, { codeRunner })` | receives the question's language and test cases (never the expected solution); `PASSED` → value, `FAILED` → 0 (`GRADED`, `RULE_RESULT`); `UNAVAILABLE` / `INFRA_ERROR` / no test case → `PENDING_TEACHER`, `finalCents = null` | FR-038, FR-040, US8-3/4 |
| `aiReview.grade(q, answer, { aiReview })` | `SUGGESTED` with 0 ≤ cents ≤ value → `SUGGESTED`, `suggestedCents`, `finalCents = null`, `SUGGESTION`; out of range → `PENDING_TEACHER` (`AI_REVIEW_OUT_OF_RANGE`); `FAILED` → `PENDING_TEACHER` (`AI_REVIEW_FAILED`) | FR-039, FR-040, US8-5/6 |
| `decideByTeacher(grading, cents)` | 0 ≤ cents ≤ value, else `GRADE_OUT_OF_RANGE`; `teacherCents = finalCents = cents`, `DECIDED`, `HUMAN_DECISION`; overrides a suggestion or a rule result (teacher review) | FR-039, US8-5 |
| `computeWorkGrade(gradings, totalCents)` | sum of `finalCents`; any `null` → `partial: true` and that question adds nothing (never 0 by default); asserts 0 ≤ cents ≤ total | FR-041, US8-7 |

A suggested grade never becomes final without `decideByTeacher` (SC-011). A technical failure
never produces 0 (FR-040). The code of the answer is data: the strategy only passes it to the
port, which the Code Runner spec isolates (constitution IV).

## Tests (011)

`works/grading/*.spec.ts`, titled `011/US8-n` and `011/SC-011`: every row above with simulated
answers and fake ports; the 0,50 × 10 multiple-choice work graded 9 and 8 correct (0,45, 0,40);
two different code sources both `PASSED` → both full value; a type test that `testCases.grade`'s
input has no expected-solution field; a property test that `computeWorkGrade` stays in
[0, total] for random gradings.

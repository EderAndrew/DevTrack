# HTTP API Contract: 013 — Pontuação e Ranking dos Exercícios

The 012 conventions apply (base `/api`, allowed `Origin` + `Content-Type: application/json` on
unsafe methods, strict bodies, check order origin → session → verified → permission → validation
→ context → rule, errors `{statusCode, code, message}`). Schemas in
`packages/contracts/src/activities/` (changed: `enums.ts`, `teacher.ts`, `student.ts`; new:
`points.ts`, `exercise-results.ts`) and `packages/contracts/src/ranking/` (new); every route in
`endpoints.ts`. ASSIGNMENT shapes and routes don't change.

## Shared shapes

```ts
ExerciseDifficulty = "BASIC" | "INTERMEDIATE" | "ADVANCED"      // 010
EXERCISE_POINTS = { BASIC: 15, INTERMEDIATE: 30, ADVANCED: 60 }
Points = int ≥ 0
StudentActivityStatus = 012 values | "COMPLETED"                // COMPLETED only for EXERCISE
RosterStatus = 012 values | "COMPLETED"                         // COMPLETED only for EXERCISE
ExerciseResult = "CORRECT" | "WRONG" | "PENDING_TEACHER" | "UNSCORED"
RankingRow = { position: int ≥ 1, name: string, points: Points, isViewer: boolean }
```

## Teacher routes

| Method & path | Permission | Change |
|---|---|---|
| `POST /classes/:classId/activities` | `atividades.aplicar` | `CreateActivity` becomes a union by `source.type` (below) |
| `PATCH /classes/:classId/activities/:activityId` | `atividades.aplicar` | EXERCISE: `deadline`, `latePolicy` → `400`; `publishAt` only while scheduled (012) |
| `GET /classes/:classId/activities[/:activityId]` | `atividades.visualizar` | EXERCISE: `totalGrade`, `deadline`, `latePolicy`, `resultReleasedAt` are `null`; adds `possiblePoints`; questions carry `difficulty`, `points`, `value: null`; roster adds `pointsEarned`, `pendingMarks` |
| `GET …/activities/:activityId/attempts/:attemptId` | `entregas.visualizar` | EXERCISE: `submission: null`; adds `exercise: { number, completedAt, results: TeacherExerciseResult[] }` |
| `PUT …/activities/:activityId/attempts/:attemptId/marks` (new) | `exercicios.corrigir` | `MarkExerciseResults` → `TeacherAttempt` |
| `PUT …/attempts/:attemptId/grades`, `POST …/accept-submission`, `POST …/release` | (012) | EXERCISE → `409 INVALID_STATE_TRANSITION` |
| `GET /classes/:classId/ranking` (new) | `ranking.visualizar` | → `ClassRanking` |

```ts
CreateActivity =
  | { idempotencyKey, source: { type: "ASSIGNMENT", workId }, title, instructions?,
      publishAt: Instant | null, deadline: Instant, latePolicy, acknowledgeOutOfScope }   // 012, no totalGrade
  | { idempotencyKey, source: { type: "EXERCISE", exerciseIds /* 1–10 */ }, title, instructions?,
      publishAt: Instant | null, acknowledgeOutOfScope }                                 // strict: totalGrade/deadline/latePolicy → 400

MarkExerciseResults = {
  marks: { questionId: uuid, result: "CORRECT" | "WRONG", comment?: string | null /* ≤ 2 000 */ }[]   // 1–10, distinct
}
// errors: 404 (context), 409 INVALID_STATE_TRANSITION (ASSIGNMENT or CANCELLED activity), 422 NOT_MARKABLE
// (question not open/code, attempt not number 1 concluded, row not scoring), 422 UNKNOWN_QUESTION, 429

TeacherExerciseResult = {
  questionId, result: ExerciseResult, points: Points, scoring: boolean, alreadyScored: boolean,
  nature: "RULE_RESULT" | "HUMAN_DECISION" | null, comment: string | null, decidedAt: Instant | null
}

ClassRanking = { class: { id, name }, rows: RankingRow[] }       // every ACTIVE enrollment
```

## Student routes

| Method & path | Permission | Body → Response | Errors |
|---|---|---|---|
| `GET /me/dashboard` | `atividades.proprias.visualizar` | adds `rankings: { class: { id, name }, top: RankingRow[] /* ≤ 5 */ }[]` (empty without `ranking.turma.visualizar`) | — |
| `GET /me/activities…` | `atividades.proprias.visualizar` | EXERCISE summaries: `deadline`, `latePolicy`, `totalGrade`, `result` null; adds `points: { possible, earned, awaitingCorrection: boolean } \| null` (null for ASSIGNMENT) | — |
| `POST /me/activities/:activityId/attempt` | `atividades.proprias.responder` | 012 start (attempt 1) | + 429 on the exercise limit |
| `POST /me/activities/:activityId/attempts` (new) | `atividades.proprias.responder` | `{ afterNumber: int ≥ 1 }` → `StudentActivity` (existing `afterNumber + 1` → 200, same attempt) | 404, 409 `ATTEMPT_NOT_COMPLETED` / `NOT_LATEST_ATTEMPT` / `ACTIVITY_CLOSED` / `CLASS_NOT_ACTIVE` / `INVALID_STATE_TRANSITION` (ASSIGNMENT), 429 |
| `PUT /me/activities/:activityId/attempt/answers` | `atividades.proprias.responder` | 012 save, on the open attempt | 012 errors (no `DEADLINE_PASSED` for EXERCISE) |
| `POST /me/activities/:activityId/attempts/:number/complete` (new) | `atividades.proprias.responder` | `SubmitAttempt` (012 shape) → `StudentActivity` (already concluded → 200, same result) | 404, 409 `NOT_STARTED` / `ANSWER_CHANGED_ELSEWHERE` / `ACTIVITY_CLOSED` / `CLASS_NOT_ACTIVE` / `INVALID_STATE_TRANSITION` (ASSIGNMENT), 422 `INVALID_ANSWER`, 429 |
| `GET /me/activities/:activityId/attempts/:number` (new) | `atividades.proprias.visualizar` | → `StudentExerciseAttempt` (a concluded attempt of the session student) | 404 |
| `POST /me/activities/:activityId/attempt/submit` | (012) | EXERCISE → `409 INVALID_STATE_TRANSITION` | |
| `GET /me/classes/:classId/ranking` (new) | `ranking.turma.visualizar` | → `ClassRanking` (`isViewer` on the session student's row) | 404 (no ACTIVE enrollment) |

```ts
StudentActivity (EXERCISE) = 012 StudentActivity with deadline/latePolicy/totalGrade/submission/result null, plus
  points: { possible, earned, awaitingCorrection },
  attempt: 012 attempt block + { number },                       // the open attempt, or null
  completedAttempts: { number, completedAt }[],                  // newest first
  lastResult: StudentExerciseAttempt | null                      // latest concluded attempt

StudentQuestion (EXERCISE) = 012 allowlist with value: null, plus points (the question's points)

StudentExerciseAttempt = {
  number, completedAt, first: boolean, pointsEarned: Points,    // pointsEarned = 0 when !first
  questions: {
    questionId, position, answer: Answer | null,
    result: ExerciseResult, points: Points, alreadyScored: boolean,
    correctAlternativeId: uuid | null, expectedAnswer: string | null, expectedSolution: string | null,
    explanation: string, teacherComment: string | null
  }[]
}
```

Before an attempt is concluded, no student response carries `correctAlternativeId`,
`expectedAnswer`, `expectedSolution`, `explanation` or a result (012 allowlist). A
`StudentExerciseAttempt` is built only by `student-view.ts` (research K10). No student response
ever carries another student's attempt or result; the ranking carries only `RankingRow`s.

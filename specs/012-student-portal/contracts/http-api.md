# HTTP API Contract: 012 — Portal do Aluno

The conventions of 001–011 apply:
- base `/api`, JSON;
- an allowed `Origin` and `Content-Type: application/json` on unsafe methods (send `{}` when there
  is no body);
- strict schemas: an unknown field → `400 VALIDATION_ERROR` (including `studentUserId`,
  `teacherId`, `status`, `submittedAt`, `late`, `grade`, `value`, `gradingStrategy`, `isCorrect`
  in student bodies);
- check order: origin → session (401) → verified e-mail (403) → permission (403) → validation
  (400) → context (404) → rule (409/422/429);
- errors are `{statusCode, code, message}`.

Schemas live in `packages/contracts/src/activities/` (`enums.ts`, `teacher.ts`, `student.ts`,
`grading.ts`) and every route has an entry in `endpoints.ts`. `Grade` and `AnswerSchema` are
imported from `packages/contracts/src/works/` (one grade arithmetic, one answer shape).

## Shared shapes

```ts
ActivityType = "EXERCISE" | "ASSIGNMENT"
ExecutionMode = "NORMAL"
ActivityStatus = "ACTIVE" | "CLOSED" | "CANCELLED"
PublicationPhase = "SCHEDULED" | "PUBLISHED"
LatePolicy = "REJECT" | "ACCEPT_MARKED"
StudentActivityStatus = "PENDING" | "IN_PROGRESS" | "OVERDUE" | "SUBMITTED" | "GRADED"
RosterStatus = "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "SUBMITTED_LATE" | "MISSED"
QuestionType = "OPEN_ANSWER" | "MULTIPLE_CHOICE" | "CODE"
Grade = string        // "0.50" — 011 W3
Answer = { kind: "TEXT", text } | { kind: "ALTERNATIVE", alternativeId | null } | { kind: "CODE", source }   // 011 AnswerSchema
Instant = string      // ISO 8601 with offset
```

## Teacher routes (`/classes/:classId/activities…`)

The class goes through `ClassContextPolicy` (another teacher's class → 404); the activity is looked
up by `(id, classId)` and the attempt by `(id, activityId)`.

| Method & path | Permission | Body → Response | Errors |
|---|---|---|---|
| `GET /classes/:classId/activities` | `atividades.visualizar` | → `{ items: TeacherActivitySummary[] }` (all statuses, deadline desc) | 404 |
| `POST /classes/:classId/activities/scope-check` | `atividades.aplicar` | `ActivitySource` → `ScopeCheck` | 404, 422 `SUBJECT_MISMATCH` |
| `POST /classes/:classId/activities` | `atividades.aplicar` | `CreateActivity` → `201 TeacherActivity` (same key → same activity, 200) | 404, 409 `CLASS_NOT_ACTIVE`, 422 `SUBJECT_MISMATCH` / `OUT_OF_SCOPE_NOT_ACKNOWLEDGED` / `SOURCE_NOT_APPROVED` / `INVALID_SCHEDULE`, 429 |
| `GET /classes/:classId/activities/:activityId` | `atividades.visualizar` | → `TeacherActivity` (snapshot with answer key + roster) | 404 |
| `PATCH /classes/:classId/activities/:activityId` | `atividades.aplicar` | `UpdateActivity` → `TeacherActivity` | 404, 409 `ACTIVITY_VERSION_CONFLICT` / `INVALID_STATE_TRANSITION`, 422 `INVALID_SCHEDULE` / `ALREADY_PUBLISHED`, 429 |
| `POST /classes/:classId/activities/:activityId/close` | `atividades.aplicar` | `{}` → `TeacherActivity` (CLOSED; already CLOSED → 200 no-op) | 404, 409 `INVALID_STATE_TRANSITION` |
| `POST /classes/:classId/activities/:activityId/cancel` | `atividades.aplicar` | `{}` → `TeacherActivity` (CANCELLED; already → 200 no-op) | 404 |
| `POST /classes/:classId/activities/:activityId/release` | `notas.liberar` | `{}` → `TeacherActivity` (already released → 200 no-op) | 404, 409 `INVALID_STATE_TRANSITION` (CANCELLED) |
| `GET /classes/:classId/activities/:activityId/attempts/:attemptId` | `entregas.visualizar` | → `TeacherAttempt` (answers, answer key, gradings, submission) | 404 |
| `POST /classes/:classId/activities/:activityId/attempts/:attemptId/accept-submission` | `notas.lancar` | `{}` → `TeacherAttempt` (already submitted → 200, same submission) | 404, 409 `STUDENT_CAN_STILL_SUBMIT` / `NOT_STARTED`, 429 |
| `PUT /classes/:classId/activities/:activityId/attempts/:attemptId/grades` | `notas.lancar` | `GradeSubmission` → `TeacherAttempt` | 404, 409 `SUBMISSION_VERSION_CONFLICT` / `NOT_SUBMITTED`, 422 `GRADE_OUT_OF_RANGE` / `UNKNOWN_QUESTION`, 429 |

```ts
ActivitySource =
  | { type: "ASSIGNMENT", workId: uuid }
  | { type: "EXERCISE", exerciseIds: uuid[] /* 1–10, distinct, in the chosen order */ }

ScopeCheck = {
  hasPlan: boolean,
  outOfScope: { syllabusItemId, title, questionPositions: int[] }[]  // empty = all taught
}

CreateActivity = {
  idempotencyKey: uuid,
  source: ActivitySource,
  title /* 1–200 */, instructions? /* ≤ 10 000 */,
  totalGrade?: Grade,                // required for EXERCISE (0.01–100.00); refused for ASSIGNMENT
  publishAt: Instant | null,         // null = now (server clock)
  deadline: Instant,                 // > publishAt
  latePolicy: LatePolicy,
  acknowledgeOutOfScope: boolean     // must be true when the scope check flags topics
}

UpdateActivity = {
  version: int,
  title?, instructions?,
  publishAt?: Instant,               // only while SCHEDULED
  deadline?: Instant,
  latePolicy?: LatePolicy            // only while ACTIVE
}

TeacherActivitySummary = {
  id, type, executionMode, title, status, phase: PublicationPhase | null,
  publishAt, deadline, latePolicy, totalGrade: Grade, resultReleasedAt: Instant | null,
  counts: { enrolled, inProgress, submitted, submittedLate, missed, pendingGrading }
}

TeacherActivity = TeacherActivitySummary & {
  instructions, version, outOfScopeTopicCount,
  source: { workId } | { exerciseIds } ,
  questions: TeacherQuestion[],      // the full snapshot, with the answer key
  roster: { studentUserId, name, enrollment: "ACTIVE" | "REMOVED", status: RosterStatus,
            attemptId: uuid | null, submittedAt: Instant | null, grade: Grade | null, gradePartial: boolean | null }[]
}

TeacherQuestion = {
  id, position, type, gradingStrategy, value: Grade, statement, instructions, starterCode,
  language: { id, name } | null, expectedAnswer, rubric, expectedSolution, explanation,
  isTrickQuestion, alternatives: { id, position, text, isCorrect }[],
  testCases: { position, input, expectedOutput, visibility }[], topics: { syllabusItemId, title }[]
}

TeacherAttempt = {
  id, student: { userId, name }, status: "IN_PROGRESS" | "SUBMITTED", startedAt, lastSavedAt,
  answers: { questionId, answer: Answer, savedAt }[],
  submission: { id, submittedAt, late, acceptedByTeacher: boolean, blankCount, grade: Grade,
                gradePartial, generalFeedback, version, gradings: QuestionGradingView[] } | null
}

QuestionGradingView = { questionId, status, nature, finalGrade: Grade | null,
                        teacherGrade: Grade | null, pendingReason, feedback }

GradeSubmission = {
  version: int,
  decisions: { questionId: uuid, grade: Grade, feedback?: string /* ≤ 5 000 */ }[],  // 0–10, distinct
  generalFeedback?: string | null    // ≤ 5 000
}
```

## Student routes (`/me/…`)

Every query starts from the session user and an ACTIVE enrollment; ids only select inside that
set (research P18). A cancelled, scheduled, other-class or other-student resource → 404.

| Method & path | Permission | Body → Response | Errors |
|---|---|---|---|
| `GET /me/dashboard` | `atividades.proprias.visualizar` | → `StudentDashboard` | — |
| `GET /me/activities?status=&type=&cursor=&pageSize=` | `atividades.proprias.visualizar` | → `{ items: StudentActivitySummary[], nextCursor }` | 400 |
| `GET /me/activities/:activityId` | `atividades.proprias.visualizar` | → `StudentActivity` | 404 |
| `POST /me/activities/:activityId/attempt` | `atividades.proprias.responder` | `{}` → `StudentActivity` (existing attempt → 200, same attempt) | 404, 409 `DEADLINE_PASSED` / `ACTIVITY_CLOSED` / `CLASS_NOT_ACTIVE`, 429 |
| `PUT /me/activities/:activityId/attempt/answers` | `atividades.proprias.responder` | `SaveAnswers` → `SaveAnswersResult` | 404, 409 `NOT_STARTED` / `ATTEMPT_ALREADY_SUBMITTED` / `DEADLINE_PASSED` / `ACTIVITY_CLOSED` / `CLASS_NOT_ACTIVE`, 422 `INVALID_ANSWER`, 429 |
| `POST /me/activities/:activityId/attempt/submit` | `atividades.proprias.responder` | `SubmitAttempt` → `StudentActivity` (already submitted → 200 with the same submission) | 404, 409 `NOT_STARTED` / `ANSWER_CHANGED_ELSEWHERE` / `DEADLINE_PASSED` / `ACTIVITY_CLOSED` / `CLASS_NOT_ACTIVE`, 422 `INVALID_ANSWER`, 429 |

`status` filter: `PENDING | IN_PROGRESS | OVERDUE | COMPLETED` (= SUBMITTED + GRADED) or absent;
`type`: `EXERCISE | ASSIGNMENT`. The history page uses `status=COMPLETED`.

```ts
StudentActivitySummary = {
  id, type, title, summary /* first 160 chars of the instructions, plain text */,
  class: { id, name }, subjectName: string | null, teacherName,
  publishedAt: Instant, deadline: Instant, latePolicy,
  status: StudentActivityStatus, late: boolean, canAnswer: boolean, urgent: boolean,
  submittedAt: Instant | null,
  totalGrade: Grade,
  result: { grade: Grade, hasFeedback: boolean } | null      // only when released and complete
}

StudentDashboard = {
  firstName,
  counts: { pending, inProgress, overdue, completed },
  next: StudentActivitySummary[],          // PENDING + IN_PROGRESS by deadline, ≤ 5
  overdueOpen: StudentActivitySummary[],   // OVERDUE that still accept delivery, by deadline
  serverNow: Instant
}

StudentActivity = StudentActivitySummary & {
  instructions, serverNow: Instant,
  questions: StudentQuestion[],
  attempt: { startedAt, lastSavedAt, answers: { questionId, answer: Answer, revision }[] } | null,
  submission: { submittedAt, late, acceptedByTeacher: boolean, blankCount } | null,
  result: { grade: Grade, generalFeedback: string | null,
            questions: { questionId, grade: Grade, feedback: string | null }[] } | null
}

StudentQuestion = {                        // allowlist (research P15)
  id, position, type, value: Grade, statement, instructions: string | null,
  starterCode: string | null, language: { name } | null,
  publicTestCases: { input, expectedOutput }[],
  alternatives: { id, text }[]             // presentation order; never isCorrect
}

SaveAnswers = { answers: { questionId: uuid, answer: Answer, baseRevision: int /* ≥ 0 */ }[] }  // 1–10, distinct
SaveAnswersResult = {
  savedAt: Instant,
  results: ( { questionId, outcome: "SAVED" | "UNCHANGED", revision }
           | { questionId, outcome: "CONFLICT", revision, answer: Answer } )[]
}

SubmitAttempt = { answers: { questionId, answer: Answer, baseRevision: int }[] }
// 0–10 pending answers, same revision rule as SaveAnswers: a stale baseRevision with other content
// → 409 ANSWER_CHANGED_ELSEWHERE and nothing is submitted (research P9)
```

Never in a student response: `expectedAnswer`, `rubric`, `expectedSolution`, `explanation`,
`isTrickQuestion`, `isCorrect`, `gradingStrategy`, PRIVATE test cases, pending reasons, another
student's anything, and — before release with complete grading — any grade or feedback.

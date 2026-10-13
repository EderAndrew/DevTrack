# HTTP API Contract: 018 — Prova em Modo Restrito com Avisos e Decisão do Professor

Shapes live in `packages/contracts/src/exams/` (bank and generation, new),
`src/exam-sessions/` (monitor and decisions, new), and in `src/activities/` and
`src/attempt-integrity/` (changed). They are cataloged in `endpoints.ts`. Unsafe methods need
`Origin` and `Content-Type: application/json`. Bodies are strict: unknown fields → `400`.

## Banco de Provas (teacher)

Mirrors the 011 work routes; differences: 1–20 questions, `difficulty` and 1–3 `topicIds` per
question, topics required.

| Method & path | Permission | Body → Response | Errors |
|---|---|---|---|
| `GET /exams` | `provas.visualizar` | query `{ status?, subjectId?, q?, cursor?, limit? }` → `Page<ExamSummary>` | 400 |
| `GET /exams/programming-languages` | `provas.visualizar` | → the active entries of the shared language catalog (as `/works/programming-languages`) | — |
| `GET /exams/:id` | `provas.visualizar` | → `TeacherExam` (with keys) | 404 |
| `GET /exams/:id/student-preview` | `provas.visualizar` | → `ExamStudentPreview` (allowlist, no key) | 404 |
| `POST /exams` | `provas.criar` | `CreateExamRequest` `{ subjectId, syllabusRevisionId, title, description?, totalGrade, saveAs: "DRAFT"\|"APPROVED", topicIds[1..20], questions[1..20] }` → `201 TeacherExam` | 400; 404 subject/revision; 422 `EXAM_RULES` (`details.violations`) |
| `PUT /exams/:id` | `provas.editar` | `UpdateExamRequest` (+ `version`) → `TeacherExam` | 404; 409 `VERSION_CONFLICT` / `EXAM_ARCHIVED`; 422 `EXAM_RULES` |
| `POST /exams/:id/approve` | `provas.aprovar` | `{ version }` → `TeacherExam` (already APPROVED → `200`, no event) | 404; 409 `VERSION_CONFLICT` / `EXAM_ARCHIVED`; 422 `EXAM_RULES` |
| `POST /exams/:id/archive` | `provas.arquivar` | `{ version }` → `TeacherExam` | 404; 409 |
| `POST /exams/:id/restore` | `provas.arquivar` | `{ version }` → `TeacherExam` | 404; 409 |

`ExamQuestionInput` = the 011 `WorkQuestionInput` + `difficulty: "BASIC"|"INTERMEDIATE"|"ADVANCED"`
(required on approve) + `topicIds: uuid[1..3]` (subset of the exam's `topicIds`). `value`,
`origin`, `status`, `reviewedAt`, `teacherId` are server fields → `400`.

## "Criar prova com IA" (teacher)

| Method & path | Permission | Body → Response | Errors |
|---|---|---|---|
| `GET /exam-generation/availability` | `ia.provas.gerar` | → `{ available, reason? }` | — |
| `POST /exam-generation-requests` | `ia.provas.gerar` | `{ subjectId, syllabusRevisionId, title, topicIds[1..10], difficulty, totalGrade, quantity(1..20), distribution: { OPEN_ANSWER, MULTIPLE_CHOICE, CODE }, trickCount(0..3), idempotencyKey }` → `202 ExamGenerationRequest` | 400 (model, provider, tier fields refused); 404; 409 `AI_UNAVAILABLE`; 422 `GENERATION_RULES`; 429 |
| `GET /exam-generation-requests/:id` | `ia.provas.gerar` | → `ExamGenerationRequest` (`status` derived; `examId` when generated) | 404 |

The generated exam is a DRAFT in the bank; approval only through `POST /exams/:id/approve`.

## Applying an exam (changed 012 routes)

- **`POST /classes/:classId/activities/scope-check`**: body `ActivitySource` gains
  `{ type: "EXAM", examId }` (the 012 union by `type`); the response gains
  `coverage: { byTopic: { syllabusItemId, title, questions, points, outOfScope }[], byDifficulty: { difficulty, questions, points }[] } | null`
  (non-null for EXAM).
- **`POST /classes/:classId/activities`** (`atividades.aplicar`): for an exam the body is
  `{ source: { type: "EXAM", examId }, title, instructions?, publishAt, durationMinutes(1..120),
  inactivityLimitSeconds(30..60, default 60), startWindowMinutes(0..60, default 15),
  acknowledgeOutOfScope, idempotencyKey }` (`title` and `acknowledgeOutOfScope` as in 012). `deadline`, `latePolicy`, `executionMode`,
  `aiHelpAllowance` and `releaseMode` → `400`. Errors: 404 exam/class; 409 `EXAM_NOT_APPROVED`
  (DRAFT or ARCHIVED, also from `scope-check`); 422 `SUBJECT_MISMATCH` and `OUT_OF_SCOPE_NOT_ACKNOWLEDGED`
  (the 012 codes and statuses).
- **`TeacherActivity` / summaries**: `type` gains `EXAM`; gain
  `exam: { durationMinutes, inactivityLimitSeconds, startWindowMinutes, startDeadline, closesAt, pendingDecisions } | null`.
- **Roster** (`RosterStatus`): gains `AWAITING_DECISION`, `TIME_EXPIRED`, `CANCELLED`,
  `ENDED_BY_WARNINGS`, `START_CLOSED`; rows gain `occurrenceCount` for EXAM.
- **`POST …/release`**: 409 `EXAM_DECISIONS_PENDING` (`details.count`) while a hold is open.
- **Integrity review** (`GET …/attempts/:attemptId/integrity`): events gain `occurrenceOrdinal|null`
  and `idleSeconds|null`; the response gains `holds: TeacherExamHold[]` for EXAM.
- **Pauses (016, research T11)**: `POST …/students/:studentUserId/pause` on an EXAM answers 409
  `EXAM_ATTEMPT_ON_HOLD` while a hold is open and `EXAM_TIME_OVER` from `endsAt` on, nothing stored;
  `POST …/pauses/:pauseId/release` answers 409 `EXAM_TIME_OVER` from `endsAt` on (a pause already
  released still comes back unchanged). A pause open at `endsAt` ends there by derivation
  (`endedBy: TIME_EXPIRED`) in the room, the monitor, the roster and the pauses of the review.

## Exam monitor and decisions (teacher, new)

| Method & path | Permission | Body → Response | Errors |
|---|---|---|---|
| `GET /classes/:classId/activities/:activityId/exam-monitor` | `chamada.registrar` | → `ExamMonitor` (polled every 5 s) | 404; 409 `NOT_AN_EXAM` |
| `POST /classes/:classId/activities/:activityId/exam-holds/:holdId/cancel` | `provas.encerramentos.decidir` | `{}` → `TeacherExamHold` | 404; 409 `INVALID_STATE_TRANSITION`; 429 |
| `POST /classes/:classId/activities/:activityId/exam-holds/:holdId/return` | `provas.encerramentos.decidir` | `{}` → `TeacherExamHold` | 404; 409 `INVALID_STATE_TRANSITION` / `EXAM_TIME_OVER` / `ACTIVITY_CLOSED`; 429 |
| `POST /classes/:classId/activities/:activityId/exam-holds/:holdId/keep` | `provas.encerramentos.decidir` | `{}` → `TeacherExamHold` ("Não cancelar") | 404; 409 `INVALID_STATE_TRANSITION` / `EXAM_TIME_NOT_OVER`; 429 |

```text
ExamMonitor { activityId, durationMinutes, startDeadline, closesAt, serverNow,
  students: { studentUserId, name, markedAt|null, examStatus, attemptId|null, startedAt|null,
              endsAt|null, occurrenceCount, openHold: TeacherExamHold|null, openPause: TeacherPause|null }[] }

TeacherExamHold { id, attemptId, occurrenceOrdinal, openedAt,
  resolution: "CANCEL_CONFIRMED"|"RETURNED"|"NOT_CANCELLED"|null, resolvedAt|null,
  canReturn: boolean }   // derived: open, now < endsAt and the activity ACTIVE
```

`examStatus` values: data-model "Derived". Students on hold sort first, then paused.

## Student routes (changed)

- **`GET /me/activities/:activityId`** (`StudentActivity`): gains `exam` (research T13). With a hold
  open, `questions` and `attempt.answers` are `[]`. Before the result release, `exam.endReason` is
  `WARNINGS` for both decisions after a hold; `CANCELLED` appears only after the release.
- **`POST /me/activities/:activityId/attempt`** (start): an EXAM requires `{ acceptRules: true }`.
  Errors gain 409 `EXAM_START_CLOSED` (after `startDeadline`).
- **`POST …/attempt/answers`** and **`POST …/attempt/submit`**: 409 `EXAM_TIME_OVER` (after
  `endsAt + grace`), `EXAM_ATTEMPT_ON_HOLD`, and the 016 `ATTEMPT_PAUSED`.
- **`POST …/attempt/events`**: `type` gains `INACTIVITY` with `idleSeconds` (30–60, only with it).
  The response gains `exam: { occurrenceCount, held: boolean } | null`. Errors: 409
  `EXAM_TIME_OVER` (after `endsAt`), `ATTEMPT_PAUSED` (016) and `ATTEMPT_ALREADY_SUBMITTED` (015), nothing stored; events during a hold are stored and not counted (`200`).
- **`POST …/attempt/pause`** (student exit, 016): 409 `EXIT_NOT_ALLOWED` for an EXAM.
- **015 help**: an EXAM answers 409 `HELP_NOT_ENABLED` (allowance 0), as any activity without help.

Fields the server controls are refused in bodies with `400`: `startedAt`, `endsAt`, `serverNow`,
`occurrenceCount`, `ordinal`, `recordedAt`, `examStatus`, `resolution`, `endReason`, `grade`.

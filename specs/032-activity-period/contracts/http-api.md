# HTTP API: 032

No new route. Changes to existing bodies and shapes (`packages/contracts/src/activities`, `exam-sessions`, `mobile`).

## `POST /classes/:classId/activities`

- **ASSIGNMENT** (`CreateAssignmentRequestSchema`): `publishAt` (null = now), `deadline` (the period's end, required),
  the 015/021/023 options as today. **`latePolicy` removed** → `400`. The server stores `REJECT`.
- **EXAM** (`CreateExamActivityRequestSchema`): `publishAt` (null = now), **`deadline` (required, new)**,
  `durationMinutes` 1–120, `inactivityLimitSeconds` 30–60. **`startWindowMinutes` removed** → `400`.
- **EXERCISE**: unchanged (`deadline` still refused, strict).
- Refinement (contract, when `publishAt` is given) and service (always, with "now" from the `Clock`):
  `deadline > publishAt`; EXAM also `deadline ≥ publishAt + durationMinutes` → `422 INVALID_SCHEDULE`.

## `PATCH /classes/:classId/activities/:activityId`

- `latePolicy` removed → `400`.
- `deadline` accepted for ASSIGNMENT (as today) and **EXAM** (research AP5):
  - SCHEDULED exam: any value with `deadline ≥ publishAt + duration` (else `422 INVALID_SCHEDULE`); a change of only
    `publishAt` is revalidated the same way.
  - PUBLISHED exam, current end in the future: only later (`422 EXAM_END_CANNOT_MOVE_EARLIER`).
  - PUBLISHED exam, current end passed: `409 ACTIVITY_PERIOD_ENDED`.
- EXERCISE with `deadline` → `400` (unchanged).

## `PUT /classes/:classId/activities/:activityId/attendance`

- A batch with a non-empty `mark` when `now > deadline` → `409 ACTIVITY_PERIOD_ENDED`, nothing written; except a legacy
  ASSIGNMENT with `latePolicy = ACCEPT_MARKED`. `unmark` unchanged (016).
- The room (`GET` and the `PUT` response, `RoomSchema`) gains `periodEnded: boolean` (`now > deadline`, false for the
  legacy `ACCEPT_MARKED` work), so the web disables the marks.

## `POST /me/activities/:id/attempt` (EXAM start)

- Accepted while `publishAt ≤ now ≤ deadline` for a student marked present; after → `409 EXAM_START_CLOSED` (unchanged
  code).

## Shapes

| Shape | Change |
|-------|--------|
| `ActivityExamSchema` (teacher) | `startWindowMinutes` removed; `startDeadline` and `closesAt` = `deadline` |
| `TeacherActivitySummary` / detail | `deadline` non-null for EXAM; `latePolicy` stays (null for EXAM/EXERCISE) |
| Student activity (exam block) | `startDeadline` = `deadline`; `endsAt` capped by the period |
| Student summaries | `deadline` non-null for EXAM |
| `ExamMonitorSchema` | `startDeadline` and `closesAt` = `deadline` (unchanged fields, AP4) |
| `MobileExamListItemSchema` | `closesAt` = `deadline` (unchanged field) |
| `RoomSchema` (attendance) | new `periodEnded: boolean` |

## Errors

| Code | Status | Message (pt-BR, API) |
|------|--------|----------------------|
| `INVALID_SCHEDULE` | 422 | O término deve ser depois do início e, na prova, deixar pelo menos a duração. |
| `EXAM_END_CANNOT_MOVE_EARLIER` | 422 | Depois de publicada, o término da prova só pode ser estendido. |
| `ACTIVITY_PERIOD_ENDED` | 409 | O período desta atividade terminou. |
| `EXAM_START_CLOSED` | 409 | O período desta prova terminou. |
